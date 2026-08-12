// ─────────────────────────────────────────────────────────────────
// Custos Casa — sincronização da sheet "CustosCasa" com os débitos directos recorrentes
// da conta Familiar (renda, seguros, condomínio, água, luz, gás, TV)
// ─────────────────────────────────────────────────────────────────
// Chamado tanto pela rota HTTP (/api/drive/custos-casa-sync) como pelo cron diário — import
// estático em ambos os sítios (imports dinâmicos falham silenciosamente em rotas de cron
// na Vercel, ver docs/PROJECT_STATE.md → Aprendizagens).
import { getSupabaseAdmin, createNotification, getValidAccessToken } from './googleDrive'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

type Bucket = 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M'
// Lista fechada de entidades conhecidas (débitos directos sempre com o mesmo texto na conta
// Familiar) — nunca adivinha por texto livre; uma transacção que não bata com nenhuma destas
// fica simplesmente de fora (falha para o lado seguro, nunca escreve valor errado). IMI e
// Empregada ficam FORA de propósito (pedido do Filipe, 2026-08-13): IMI é anual e raro (out of
// scope por agora), e a transferência da empregada ainda não tem um padrão de texto estável
// (já vistos: "FILIPE CECILIA 202604", "ORDENADO FLOR 202606", "ORDENADO 2026-07") — ambas
// colunas continuam a preenchimento manual do Filipe.
const RULES: { bucket: Bucket, match: RegExp }[] = [
  { bucket: 'F', match: /AMORT.*RENDA/ },              // Pagamento de Amort./Renda... → crédito habitação
  { bucket: 'G', match: /ZURICH VIDA|TARIFA PLANA SEGUROS/ }, // seguro de vida + seguro habitação
  { bucket: 'H', match: /CONDOMINIO PREDIO/ },
  { bucket: 'J', match: /\bEPAL\b/ },                  // água
  { bucket: 'K', match: /PETROGAL/ },                  // Galp — electricidade
  { bucket: 'L', match: /LISBOAGAS/ },                 // gás natural
  { bucket: 'M', match: /NOS COMUNICACOES/ },          // TV/internet
]

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
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

// Mês corrente + N anteriores, formato "AAAAMM" (igual à coluna E da sheet). Janela pequena e
// sempre relativa a hoje — nunca toca em histórico, sem precisar de fronteira explícita como
// no LedgerAuto (aqui cada mês é 1 linha só, não há região a "possuir").
function monthsBack(n: number): string[] {
  const now = new Date()
  const out: string[] = []
  for (let i = 0; i <= n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

// 0 transacções → célula vazia (consistente com o padrão já usado, ex: Água nos meses sem
// factura bimestral). 1 → número simples. 2+ → fórmula de soma com vírgula decimal (locale
// europeu), tal como o Filipe já escreve à mão (ex: "=46,36+30,25").
function toCell(values: number[]): string | number {
  if (values.length === 0) return ''
  const rounded = values.map(v => Math.round(v * 100) / 100)
  if (rounded.length === 1) return rounded[0]
  return '=' + rounded.map(v => v.toFixed(2).replace('.', ',')).join('+')
}

type SyncResult = { ok: boolean; message: string }

// Sincroniza o mês corrente + 2 anteriores (janela pequena, para apanhar facturas com atraso —
// ex: Água é bimestral) da sheet "CustosCasa" com os débitos directos conhecidos da conta
// Familiar. Só escreve nas colunas Renda/Seguros/Condomínio/Água/Luz/Gás/TV (F,G,H,J,K,L,M) —
// nunca em A-E (fórmulas do Filipe), IMI, Empregada (fora de âmbito), Acerto (ajuste manual)
// nem nas colunas de totais (P+).
export async function syncCustosCasa(userId: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: config } = await supabaseAdmin
    .from('custos_casa_config').select('*').eq('user_id', userId).maybeSingle()
  if (!config) return { ok: true, message: 'Custos Casa não ligado — nada a fazer' }

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return { ok: false, message: 'Drive não ligada ou token inválido' }

  const targetMonths = monthsBack(2)
  const oldestMonth = targetMonths[targetMonths.length - 1]
  const startDate = `${oldestMonth.slice(0, 4)}-${oldestMonth.slice(4, 6)}-01`

  const { data: accs } = await supabaseAdmin.from('accounts').select('id').eq('budget_tag', 'familiar')
  const accIds = (accs ?? []).map((a: any) => a.id)
  const { data: txns } = await supabaseAdmin.from('transactions').select('data,valor,descritivo')
    .in('account_id', accIds).is('imovel_id', null).lt('valor', 0).gte('data', startDate)

  const sums = new Map<string, Map<Bucket, number[]>>()
  for (const t of (txns ?? []) as { data: string, valor: number, descritivo: string | null }[]) {
    const mes = t.data.slice(0, 4) + t.data.slice(5, 7)
    if (!targetMonths.includes(mes)) continue
    const desc = normalize(t.descritivo ?? '')
    const rule = RULES.find(r => r.match.test(desc))
    if (!rule) continue
    if (!sums.has(mes)) sums.set(mes, new Map())
    const monthMap = sums.get(mes)!
    if (!monthMap.has(rule.bucket)) monthMap.set(rule.bucket, [])
    monthMap.get(rule.bucket)!.push(Math.abs(Number(t.valor)))
  }

  const sheetRange = encodeURIComponent(config.sheet_title)
  // Localiza a linha de cada mês-alvo pela coluna E (que já é a fonte da verdade do layout —
  // a sheet vem pré-criada pelo Filipe com o esqueleto de meses até 2037).
  const colE = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!E1:E300`, accessToken)
  const eValues: string[][] = colE.values ?? []
  const rowForMonth = new Map<string, number>()
  eValues.forEach((r, i) => { if (targetMonths.includes(r[0])) rowForMonth.set(r[0], i + 1) })

  const updates: { range: string, values: (string | number)[][] }[] = []
  let touchedRows = 0
  for (const mes of targetMonths) {
    const row = rowForMonth.get(mes)
    if (!row) continue // mês fora do template pré-criado da sheet — não deveria acontecer, mas não falha
    const monthMap = sums.get(mes) ?? new Map<Bucket, number[]>()
    const fgh = (['F', 'G', 'H'] as Bucket[]).map(b => toCell(monthMap.get(b) ?? []))
    const jklm = (['J', 'K', 'L', 'M'] as Bucket[]).map(b => toCell(monthMap.get(b) ?? []))
    updates.push({ range: `${sheetRange}!F${row}:H${row}`, values: [fgh] })
    updates.push({ range: `${sheetRange}!J${row}:M${row}`, values: [jklm] })
    touchedRows++
  }

  if (updates.length > 0) {
    await sheetsFetch(`/${config.spreadsheet_id}/values:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
    })
  }

  await supabaseAdmin.from('custos_casa_config').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)

  return { ok: true, message: `${touchedRows} mês(es) actualizados (${targetMonths[0]} a ${oldestMonth})` }
}

// Corre a sincronização para todos os users que já ligaram um ficheiro — usado pelo cron.
export async function syncCustosCasaForAllUsers(): Promise<{ userId: string; result: SyncResult }[]> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: configs } = await supabaseAdmin.from('custos_casa_config').select('user_id')
  const results = []
  for (const c of configs ?? []) {
    try {
      const result = await syncCustosCasa(c.user_id)
      results.push({ userId: c.user_id, result })
      if (!result.ok) {
        await createNotification({
          userId: c.user_id,
          type: 'import_error',
          title: 'Custos Casa — falha na sincronização',
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
