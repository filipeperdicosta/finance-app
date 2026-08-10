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
const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const HEADER = ['Data','Mês','Trimestre','Ano','Património','Tipo de Movimento','Movimento','Comentário','ID interno (não editar)']

function mesLabel(dataIso: string): string {
  const [ano, mes] = dataIso.split('-')
  return `${MESES_PT[Number(mes)-1]}./${ano.slice(2)}`
}
function trimestreLabel(dataIso: string): string {
  const [ano, mes] = dataIso.split('-')
  const t = Math.ceil(Number(mes)/3)
  return `${ano.slice(2)}T${t}`
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

// Garante que a sheet "LedgerAuto" existe no ficheiro (cria-a, com cabeçalho, se for a
// primeira sincronização) — devolve o título real usado.
async function ensureSheetExists(spreadsheetId: string, sheetTitle: string, accessToken: string) {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties.title`, accessToken)
  const exists = (meta.sheets ?? []).some((s: any) => s.properties?.title === sheetTitle)
  if (exists) return
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }),
  })
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADER] }),
  })
}

type SyncResult = { ok: boolean; message: string; rows?: number }

// Reconciliação por reescrita completa: mais simples e idempotente do que um diff
// linha-a-linha (mesmo resultado sempre, independente do estado anterior da sheet) — o
// volume (algumas centenas de transações) não justifica a complexidade de um diff cirúrgico.
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

  const linhas = (txns ?? [])
    .map((t: Transaction) => {
      const tipo = ledgerTipoMovimento(t)
      if (!tipo) return null
      const patrimonio = nomeCurto.get(t.imovel_id as string) ?? '?'
      return [t.data, mesLabel(t.data), trimestreLabel(t.data), t.data.slice(0, 4), patrimonio, tipo, Number(t.valor), t.descritivo ?? '', t.id]
    })
    .filter((r): r is (string | number)[] => r !== null)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  await ensureSheetExists(config.spreadsheet_id, config.sheet_title, accessToken)

  const sheetRange = encodeURIComponent(config.sheet_title)
  // Limpa tudo abaixo do cabeçalho antes de reescrever — remove linhas de transações que
  // deixaram de ser relevantes (reclassificadas, desassociadas do imóvel, apagadas).
  await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A2:I50000:clear`, accessToken, { method: 'POST' })
  if (linhas.length > 0) {
    await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!A2?valueInputOption=USER_ENTERED`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ values: linhas }),
    })
  }

  await supabaseAdmin.from('ledger_auto_config').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)

  return { ok: true, message: `${linhas.length} linhas sincronizadas`, rows: linhas.length }
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
