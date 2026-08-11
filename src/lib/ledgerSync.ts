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
  return `=INDEX({"jan";"fev";"mar";"abr";"mai";"jun";"jul";"ago";"set";"out";"nov";"dez"},MONTH(A${row}))&"./"&TEXT(A${row},"yy")`
}
function trimestreFormula(row: number): string {
  return `=TEXT(A${row},"yy")&"T"&ROUNDUP(MONTH(A${row})/3,0)`
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

type SyncResult = { ok: boolean; message: string; rows?: number }

// Reconciliação por reescrita completa da região que a app gere — mas só dessa região.
// A coluna J (ID interno) é a marca de posse: qualquer linha com um ID lá foi escrita por
// nós, qualquer linha sem ID é histórico manual do Filipe e NUNCA é tocada. A fronteira é
// sempre recalculada a partir do que já está na sheet, por isso é seguro mesmo que o Filipe
// adicione mais histórico manual entretanto.
export async function syncLedgerAuto(userId: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: config } = await supabaseAdmin
    .from('ledger_auto_config').select('*').eq('user_id', userId).maybeSingle()
  if (!config) return { ok: true, message: 'LedgerAuto não ligado — nada a fazer' }

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return { ok: false, message: 'Drive não ligada ou token inválido' }

  const [{ data: imoveis }, { data: txns }] = await Promise.all([
    supabaseAdmin.from('imoveis').select('id,nome'),
    supabaseAdmin.from('transactions').select('*').not('imovel_id', 'is', null) as unknown as Promise<{ data: Transaction[] }>,
  ])
  const nomeCurto = new Map((imoveis ?? []).map((im: any) => [im.id, String(im.nome).split(' ')[0]]))

  const desejadas = (txns ?? [])
    .map((t: Transaction) => {
      const tipo = ledgerTipoMovimento(t)
      if (!tipo) return null
      const patrimonio = nomeCurto.get(t.imovel_id as string) ?? '?'
      return { data: t.data, patrimonio, tipo, valor: Number(t.valor), descritivo: t.descritivo ?? '', id: t.id }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.data.localeCompare(b.data))

  await ensureSheetExists(config.spreadsheet_id, config.sheet_title, accessToken)
  const sheetRange = encodeURIComponent(config.sheet_title)

  // Fronteira: última linha (a partir da FIRST_DATA_ROW) sem ID na coluna J → é a última
  // linha protegida. Tudo depois disso é nosso.
  const existing = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${FIRST_DATA_ROW}:J50000`, accessToken)
  const existingRows: string[][] = existing.values ?? []
  let lastProtectedOffset = -1
  existingRows.forEach((row, i) => { if (!row[9]) lastProtectedOffset = i })
  const firstManagedRow = FIRST_DATA_ROW + lastProtectedOffset + 1

  // Limpa só a partir da fronteira — nunca antes dela.
  await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${firstManagedRow}:J50000:clear`, accessToken, { method: 'POST' })

  if (desejadas.length > 0) {
    const linhas = desejadas.map((t, i) => {
      const row = firstManagedRow + i
      return [t.data, mesFormula(row), trimestreFormula(row), anoFormula(row), t.patrimonio, t.tipo, t.valor, '', t.descritivo, t.id]
    })
    await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A${firstManagedRow}?valueInputOption=USER_ENTERED`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ values: linhas }),
    })
  }

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
