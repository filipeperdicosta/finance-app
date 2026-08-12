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

// Reconciliação por reescrita completa da região que a app gere — mas só dessa região. A
// fronteira é por ANO (coluna D), recalculada a cada sincronização a partir do que já está
// na sheet: nunca tocamos em linhas de anos anteriores ao ano mais antigo que a app tem para
// sincronizar. A coluna J (ID interno) fica só para rastreabilidade — não decide o que é
// tocado, para funcionar mesmo na primeira sincronização, sem nenhum ID ainda gravado.
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
  const existing = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!D${FIRST_DATA_ROW}:D50000`, accessToken)
  const existingYears: string[][] = existing.values ?? []
  let lastProtectedOffset = -1
  existingYears.forEach((row, i) => {
    const y = Number(row[0])
    if (Number.isFinite(y) && y < earliestYear) lastProtectedOffset = i
  })
  const firstManagedRow = FIRST_DATA_ROW + lastProtectedOffset + 1

  // Limpa só a partir da fronteira — nunca antes dela.
  await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${firstManagedRow}:J50000:clear`, accessToken, { method: 'POST' })

  const linhas = desejadas.map((t, i) => {
    const row = firstManagedRow + i
    return [t.data, mesFormula(row), trimestreFormula(row), anoFormula(row), t.patrimonio, t.tipo, t.valor, '', t.descritivo, t.id]
  })
  await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${firstManagedRow}?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: linhas }),
  })

  const lastRow = firstManagedRow + desejadas.length - 1
  await extendTableRange(config.spreadsheet_id, config.sheet_title, lastRow, accessToken)

  await supabaseAdmin.from('ledger_auto_config').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)

  return { ok: true, message: `${desejadas.length} linhas sincronizadas (a partir da linha ${firstManagedRow})`, rows: desejadas.length }
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
