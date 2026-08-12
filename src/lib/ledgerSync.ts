// ─────────────────────────────────────────────────────────────────
// LedgerAuto — sincronização da sheet "LedgerAuto" com as transações de IRS da app
// ─────────────────────────────────────────────────────────────────
// Chamado tanto pela rota HTTP (/api/drive/ledger-sync) como pelo cron diário — import
// estático em ambos os sítios (imports dinâmicos falham silenciosamente em rotas de cron
// na Vercel, ver docs/PROJECT_STATE.md → Aprendizagens).
import { getSupabaseAdmin, createNotification, getValidAccessToken } from './googleDrive'
import { ledgerTipoMovimento } from './irs'
import type { Transaction } from './supabase'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
// A Ledger manual do Filipe segue sempre este layout: linha 1 = filtros/resumo (dele, nunca
// tocamos), linha 2 = cabeçalhos, linha 3+ = dados. As colunas B/C/D (Mês/Trimestre/Ano) são
// sempre fórmulas a partir da própria coluna A da mesma linha.
const HEADER_ROW = 2
const FIRST_DATA_ROW = 3
const HEADER_FULL = ['Data','Mês','Trimestre','Ano','Património','Tipo de Movimento','Movimento','Comentário','Descrição da transação','ID interno (transação)']
// Só as 2 colunas novas — nunca reescrevemos A2:H2, que já existem e pertencem ao Filipe.
const HEADER_NEW_COLS = ['Descrição da transação','ID interno (transação)']

function mesFormula(row: number): string {
  return `=TEXT($A${row};"mmm/yy")`
}
function trimestreFormula(row: number): string {
  return `=TEXT(A${row};"yy")&"T"&ROUNDUP(MONTH(A${row})/3;0)`
}
function anoFormula(row: number): string {
  return `=YEAR(A${row})`
}

async function sheetsFetch(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets API ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

// Garante que a sheet "LedgerAuto" existe no ficheiro — cria-a (com o cabeçalho completo na
// linha 2, layout igual à Ledger manual) só se for mesmo a primeira vez. Se já existir (caso
// normal — o Filipe cria-a manualmente a partir da Ledger, com histórico próprio), nunca
// tocamos nas colunas A-H já existentes; só garantimos os cabeçalhos das 2 colunas novas.
async function ensureSheetExists(spreadsheetId: string, sheetTitle: string, accessToken: string) {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties.title`, accessToken)
  const exists = (meta.sheets ?? []).some((s: any) => s.properties?.title === sheetTitle)
  const range = encodeURIComponent(sheetTitle)
  if (!exists) {
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }),
    })
    await sheetsFetch(`/${spreadsheetId}/values/${range}!A${HEADER_ROW}?valueInputOption=USER_ENTERED`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ values: [HEADER_FULL] }),
    })
    return
  }
  await sheetsFetch(`/${spreadsheetId}/values/${range}!I${HEADER_ROW}:J${HEADER_ROW}?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADER_NEW_COLS] }),
  })
}

// Se a sheet tiver uma "Table" estruturada (a funcionalidade nativa de tabelas do Sheets, com
// filtros/dropdowns por coluna — é o que dá aquela moldura à volta dos dados na folha do
// Filipe), o intervalo dela não cresce sozinho quando escrevemos linhas novas por baixo. Sem
// isto, uma pivot table apontada à Table ficava sempre um passo atrás do que sincronizamos.
// Não crítico — se falhar por algum motivo (ex: API de Tables indisponível), não deve
// derrubar a sincronização em si, só fica por actualizar visualmente.
// `values.update`/`values.clear` só tocam em valores, nunca em formatação — por isso linhas já
// escritas em sincronizações anteriores mantêm sempre o formato (moeda, contornos, etc.), mesmo
// depois de limpas e reescritas. O único caso que fica por formatar são linhas genuinamente novas,
// que nunca existiram na sheet antes (a table cresceu para além do que alguma vez teve formato).
// Por isso copiamos só o formato (não os valores) da última linha já formatada para essas linhas
// extra. Não crítico — falha em silêncio (console.warn) sem derrubar a sincronização.
async function copyFormatForNewRows(spreadsheetId: string, sheetTitle: string, templateRow1Indexed: number, fromRow1Indexed: number, toRow1Indexed: number, accessToken: string) {
  try {
    const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties(sheetId,title)`, accessToken)
    const sheetId = (meta.sheets ?? []).find((s: any) => s.properties?.title === sheetTitle)?.properties?.sheetId
    if (sheetId === undefined) return
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          copyPaste: {
            source: { sheetId, startRowIndex: templateRow1Indexed - 1, endRowIndex: templateRow1Indexed, startColumnIndex: 0, endColumnIndex: 10 },
            destination: { sheetId, startRowIndex: fromRow1Indexed - 1, endRowIndex: toRow1Indexed, startColumnIndex: 0, endColumnIndex: 10 },
            pasteType: 'PASTE_FORMAT',
          },
        }],
      }),
    })
  } catch (err: any) {
    console.warn('LedgerAuto: não consegui copiar o formato para as linhas novas:', err.message)
  }
}

async function extendTableRange(spreadsheetId: string, sheetTitle: string, lastRow1Indexed: number, accessToken: string) {
  try {
    const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets(properties(sheetId,title),tables)`, accessToken)
    const sheet = (meta.sheets ?? []).find((s: any) => s.properties?.title === sheetTitle)
    const table = sheet?.tables?.[0]
    if (!sheet || !table) return
    const range = table.range ?? {}
    const desiredEndRowIndex = lastRow1Indexed // 0-indexed exclusivo == último nº de linha 1-indexado
    const desiredEndColumnIndex = Math.max(range.endColumnIndex ?? 0, 10) // até à coluna J (índice 9, exclusivo 10)
    if (range.endRowIndex === desiredEndRowIndex && range.endColumnIndex === desiredEndColumnIndex) return
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          updateTable: {
            table: { tableId: table.tableId, range: { ...range, endRowIndex: desiredEndRowIndex, endColumnIndex: desiredEndColumnIndex } },
            fields: 'range',
          },
        }],
      }),
    })
  } catch (err: any) {
    console.warn('LedgerAuto: não consegui alargar o intervalo da Table:', err.message)
  }
}

type SyncResult = { ok: boolean; message: string; rows?: number }

// Reconciliação por DELTA da região que a app gere — mas só dessa região. A fronteira é por
// ANO (coluna D), recalculada a cada sincronização a partir do que já está na sheet: nunca
// tocamos em linhas de anos anteriores ao ano mais antigo que a app tem para sincronizar.
// Dentro da região gerida, emparelhamos por ID (coluna J) com o que já está na sheet:
//   1) linhas cujos valores mudaram → actualizadas só nessas células (nunca em B/C/D, que são
//      fórmulas, nem em H, que é do Filipe — por isso comentários manuais sobrevivem);
//   2) linhas cuja transação deixou de ser relevante → removidas (deleteDimension);
//   3) transações novas → acrescentadas sempre ao FUNDO da região gerida, não na posição
//      cronológica correcta — reordenar por ordem de data deslocaria os índices de linha de
//      tudo o resto, o que exigiria muito mais lógica para um ganho só estético; se a ordem
//      cronológica estrita importar nalgum momento, o Filipe reordena manualmente (pedido
//      dele, 2026-08-12).
export async function syncLedgerAuto(userId: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: config } = await supabaseAdmin
    .from('ledger_auto_config').select('*').eq('user_id', userId).maybeSingle()
  if (!config) return { ok: true, message: 'LedgerAuto não ligado — nada a fazer' }

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return { ok: false, message: 'Drive não ligada ou token inválido' }

  const [{ data: imoveis }, { data: txns }] = await Promise.all([
    supabaseAdmin.from('imoveis').select('id,nome,ativo'),
    supabaseAdmin.from('transactions').select('*').not('imovel_id', 'is', null) as unknown as Promise<{ data: Transaction[] }>,
  ])
  const nomeCurto = new Map((imoveis ?? []).map((im: any) => [im.id, String(im.nome).split(' ')[0]]))
  // Imóveis sem renda activa (ex: Casal) não interessam para IRS, mas o Filipe quer sempre
  // acompanhar os custos — por isso entram sempre em "Outras não dedutíveis", sem precisar
  // de classificação manual por balde (ver ledgerTipoMovimento).
  const semRendaSet = new Set((imoveis ?? []).filter((im: any) => !im.ativo).map((im: any) => im.id))

  const desejadas = (txns ?? [])
    .map((t: Transaction) => {
      const tipo = ledgerTipoMovimento(t, semRendaSet.has(t.imovel_id as string))
      if (!tipo) return null
      const patrimonio = nomeCurto.get(t.imovel_id as string) ?? '?'
      return { data: t.data, patrimonio, tipo, valor: Number(t.valor), descritivo: t.descritivo ?? '', id: t.id }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.data.localeCompare(b.data))

  if (desejadas.length === 0) {
    return { ok: true, message: 'Sem transações classificadas para IRS ainda — nada para sincronizar.', rows: 0 }
  }

  await ensureSheetExists(config.spreadsheet_id, config.sheet_title, accessToken)
  const sheetRange = encodeURIComponent(config.sheet_title)

  // Fronteira por ANO, não por ID: a coluna D já é uma fórmula "=YEAR(A...)" em todas as
  // linhas (incluindo as manuais do Filipe), por isso lemos o valor calculado em vez da
  // coluna A em bruto — evita depender do formato de exibição da data (DD/MM/AAAA vs ISO).
  // Última linha com ano ANTERIOR ao ano mais antigo que a app tem para sincronizar → é a
  // última linha protegida. Tudo depois disso é gerido por nós. Isto funciona mesmo na
  // primeira sincronização (sem nenhum ID ainda gravado) e ajusta-se sozinho se um dia a
  // app passar a ter histórico de anos mais antigos.
  const earliestYear = Math.min(...desejadas.map(t => Number(t.data.slice(0, 4))))
  const existingD = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!D${FIRST_DATA_ROW}:D50000`, accessToken)
  const existingYears: string[][] = existingD.values ?? []
  let lastProtectedOffset = -1
  existingYears.forEach((row, i) => {
    const y = Number(row[0])
    if (Number.isFinite(y) && y < earliestYear) lastProtectedOffset = i
  })
  const firstManagedRow = FIRST_DATA_ROW + lastProtectedOffset + 1

  // Lê a região gerida por nós, completa (A:J), para emparelhar por ID com o que já lá está.
  const managedRaw = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${firstManagedRow}:J50000`, accessToken)
  const managedRows: string[][] = managedRaw.values ?? []
  type LinhaExistente = { row: number; data: string; patrimonio: string; tipo: string; valor: number; descritivo: string }
  const existingById = new Map<string, LinhaExistente>()
  managedRows.forEach((r, i) => {
    const id = r[9]
    if (!id) return
    existingById.set(id, {
      row: firstManagedRow + i,
      data: r[0] ?? '', patrimonio: r[4] ?? '', tipo: r[5] ?? '',
      valor: Number(r[6] ?? 0), descritivo: r[8] ?? '',
    })
  })
  const regionLastRow = managedRows.length > 0 ? firstManagedRow + managedRows.length - 1 : firstManagedRow - 1

  // 1) Actualizações — só as células das linhas cujos valores realmente mudaram.
  const valueUpdates: { range: string; values: any[][] }[] = []
  let updatedCount = 0
  for (const t of desejadas) {
    const ex = existingById.get(t.id)
    if (!ex) continue
    if (ex.data === t.data && ex.patrimonio === t.patrimonio && ex.tipo === t.tipo && ex.valor === t.valor && ex.descritivo === t.descritivo) continue
    valueUpdates.push({ range: `${sheetRange}!A${ex.row}`, values: [[t.data]] })
    valueUpdates.push({ range: `${sheetRange}!E${ex.row}:G${ex.row}`, values: [[t.patrimonio, t.tipo, t.valor]] })
    valueUpdates.push({ range: `${sheetRange}!I${ex.row}`, values: [[t.descritivo]] })
    updatedCount++
  }
  if (valueUpdates.length > 0) {
    await sheetsFetch(`/${config.spreadsheet_id}/values:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: valueUpdates }),
    })
  }

  // 2) Remoções — transações que já não são relevantes (desclassificadas, apagadas, etc.).
  const desiredIds = new Set(desejadas.map(t => t.id))
  const rowsToDelete: number[] = []
  existingById.forEach((ex, id) => {
    if (!desiredIds.has(id)) rowsToDelete.push(ex.row)
  })
  rowsToDelete.sort((a, b) => b - a) // descendente: cada delete usa índices originais, sem invalidar os seguintes
  if (rowsToDelete.length > 0) {
    const meta = await sheetsFetch(`/${config.spreadsheet_id}?fields=sheets.properties(sheetId,title)`, accessToken)
    const sheetId = (meta.sheets ?? []).find((s: any) => s.properties?.title === config.sheet_title)?.properties?.sheetId
    if (sheetId !== undefined) {
      await sheetsFetch(`/${config.spreadsheet_id}:batchUpdate`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          requests: rowsToDelete.map(row => ({
            deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } },
          })),
        }),
      })
    }
  }

  // 3) Novas — acrescentadas ao fundo da região gerida (ver nota acima da função).
  const newItems = desejadas.filter(t => !existingById.has(t.id))
  const afterDeleteLastRow = regionLastRow - rowsToDelete.length
  let finalLastRow = afterDeleteLastRow
  if (newItems.length > 0) {
    const appendStartRow = afterDeleteLastRow + 1
    const linhas = newItems.map((t, i) => {
      const row = appendStartRow + i
      return [t.data, mesFormula(row), trimestreFormula(row), anoFormula(row), t.patrimonio, t.tipo, t.valor, '', t.descritivo, t.id]
    })
    await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${appendStartRow}?valueInputOption=USER_ENTERED`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ values: linhas }),
    })
    finalLastRow = appendStartRow + newItems.length - 1
    if (afterDeleteLastRow >= firstManagedRow) {
      await copyFormatForNewRows(config.spreadsheet_id, config.sheet_title, afterDeleteLastRow, appendStartRow, finalLastRow, accessToken)
    }
  }

  if (finalLastRow >= firstManagedRow) {
    await extendTableRange(config.spreadsheet_id, config.sheet_title, finalLastRow, accessToken)
  }

  await supabaseAdmin.from('ledger_auto_config').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)

  return {
    ok: true,
    message: `${newItems.length} novas, ${updatedCount} actualizadas, ${rowsToDelete.length} removidas (total ${desejadas.length})`,
    rows: desejadas.length,
  }
}

// Corre a sincronização para todos os users que já ligaram um ficheiro — usado pelo cron.
export async function syncLedgerAutoForAllUsers(): Promise<{ userId: string; result: SyncResult }[]> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: configs } = await supabaseAdmin.from('ledger_auto_config').select('user_id')
  const results = []
  for (const c of configs ?? []) {
    try {
      const result = await syncLedgerAuto(c.user_id)
      results.push({ userId: c.user_id, result })
      if (!result.ok) {
        await createNotification({
          userId: c.user_id,
          type: 'import_error',
          title: 'LedgerAuto — falha na sincronização',
          body: result.message,
          meta: {},
        })
      }
    } catch (err: any) {
      results.push({ userId: c.user_id, result: { ok: false, message: err.message || 'Erro interno' } })
    }
  }
  return results
}
