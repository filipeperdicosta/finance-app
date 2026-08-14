// ─────────────────────────────────────────────────────────────────
// Custos Casa — sincronização da sheet "CustosCasa" com os débitos directos recorrentes
// da conta Familiar (renda, seguros, condomínio, água, luz, gás, TV, empregada)
// ─────────────────────────────────────────────────────────────────
// Chamado tanto pela rota HTTP (/api/drive/custos-casa-sync) como pelo cron diário — import
// estático em ambos os sítios (imports dinâmicos falham silenciosamente em rotas de cron
// na Vercel, ver docs/PROJECT_STATE.md → Aprendizagens).
import { getSupabaseAdmin, createNotification, getValidAccessToken } from './googleDrive'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

type Bucket = 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M' | 'N'
// Lista fechada de entidades conhecidas (débitos directos sempre com o mesmo texto na conta
// Familiar) — nunca adivinha por texto livre; uma transacção que não bata com nenhuma destas
// fica simplesmente de fora (falha para o lado seguro, nunca escreve valor errado). IMI fica
// FORA de propósito (pedido do Filipe, 2026-08-13): é anual e raro, out of scope por agora.
// Cada regra exige a SUA categoria exacta, não só a lista geral — medido directamente no
// histórico (2026-08-13): a mesma entidade pode aparecer em categorias diferentes por motivos
// diferentes (ex: "Petrogal" é tanto o débito da electricidade, categoria Utilities, como
// abastecimentos de gasóleo na bomba, categoria Transportes — apanhado pelo Filipe depois de um
// mês ter somado os dois). Tabela completa em docs/PROJECT_STATE.md.
const RULES: { bucket: Bucket, match: RegExp, categorias: string[] }[] = [
  { bucket: 'F', match: /AMORT.*RENDA/, categorias: ['Habitação'] },              // crédito habitação
  { bucket: 'G', match: /ZURICH VIDA|TARIFA PLANA SEGUROS/, categorias: ['Habitação'] }, // seguro vida + habitação
  { bucket: 'H', match: /CONDOMINIO PREDIO/, categorias: ['Habitação'] },
  { bucket: 'J', match: /\bEPAL\b/, categorias: ['Utilities'] },                  // água
  { bucket: 'K', match: /PETROGAL/, categorias: ['Utilities'] },                  // Galp — electricidade (nunca Transportes)
  { bucket: 'L', match: /LISBOAGAS/, categorias: ['Utilities'] },                 // gás natural
  { bucket: 'M', match: /NOS COMUNICACOES/, categorias: ['Utilities'] },          // TV/internet
]
// Filtro grosseiro ao nível da query (performance) — a precisão real vem de `categorias` acima
// e do `categoria !== 'Habitação'` explícito para Ordenado/SS mais abaixo.
const CATEGORIAS_ELEGIVEIS = ['Habitação', 'Utilities']

// Empregada (coluna N) — dois pagamentos diferentes que o Filipe soma manualmente há anos:
// o ordenado em si, e a contribuição da Segurança Social sobre esse ordenado. Ao contrário das
// outras colunas, nenhum dos dois se atribui ao mês em que a transacção acontece — atribuem-se
// ao mês de trabalho a que se referem (o Filipe explicou o calendário exacto, 2026-08-13):
//   - Ordenado: pago entre dia 25 do próprio mês e dia 7 do mês seguinte. Por isso uma
//     transacção nos primeiros 7 dias do mês é sempre do mês ANTERIOR; a partir do dia 8
//     assume-se já o mês corrente (cobre o pagamento típico no fim do mês, dias 25-31).
//   - Segurança Social: paga sempre entre os dias 11-20 do mês seguinte ao de referência — por
//     isso é sempre o mês anterior ao da transacção, sem excepção.
// O texto da transferência do ordenado varia (já vistos: "FILIPE CECILIA 202604", "ORDENADO
// FLOR 202606", "ORDENADO 2026-07") mas inclui sempre "ORDENADO" ou "FILIPE" dentro da conta
// Familiar/categoria Habitação — suficientemente restrito para não confundir com outras coisas.
const ORDENADO_MATCH = /\bORDENADO\b|\bFILIPE\b/
const SS_MATCH = /PAG\.SS|IGFSS/

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

// "AAAAMM" do mês anterior a "mes" (mesmo formato "AAAAMM" usado em todo o ficheiro).
function prevMonth(mes: string): string {
  const y = Number(mes.slice(0, 4)), m = Number(mes.slice(4, 6))
  const d = new Date(Date.UTC(y, m - 2, 1)) // m-1 é o mês actual 0-indexed; -1 outra vez = anterior
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
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

// Azul no texto = "esta célula foi escrita pela sincronização automática", pedido do Filipe
// para nunca ficar em dúvida se um valor é carregamento manual ou automático quando o número
// bate certo com o que ele próprio teria escrito. Só marca células com conteúdo real (nunca as
// que ficam vazias por não haver transacção a bater com nenhuma regra). Não crítico — falha em
// silêncio, nunca derruba a sincronização.
const BLUE_AUTO = { red: 0.06, green: 0.35, blue: 0.9 }
async function colorCellsBlue(spreadsheetId: string, sheetTitle: string, cells: { row: number, col: number }[], accessToken: string) {
  if (cells.length === 0) return
  try {
    const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets.properties(sheetId,title)`, accessToken)
    const sheetId = (meta.sheets ?? []).find((s: any) => s.properties?.title === sheetTitle)?.properties?.sheetId
    if (sheetId === undefined) return
    await sheetsFetch(`/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: cells.map(c => ({
          repeatCell: {
            range: { sheetId, startRowIndex: c.row - 1, endRowIndex: c.row, startColumnIndex: c.col, endColumnIndex: c.col + 1 },
            cell: { userEnteredFormat: { textFormat: { foregroundColor: BLUE_AUTO } } },
            fields: 'userEnteredFormat.textFormat.foregroundColor',
          },
        })),
      }),
    })
  } catch (err: any) {
    console.warn('Custos Casa: não consegui marcar as células a azul:', err.message)
  }
}

const BUCKET_COL: Record<Bucket, number> = { F: 5, G: 6, H: 7, J: 9, K: 10, L: 11, M: 12, N: 13 }
const BUCKETS: Bucket[] = ['F', 'G', 'H', 'J', 'K', 'L', 'M', 'N']

// Compara o valor computado agora com o que já está na célula — tolerante a arredondamento de
// vírgula flutuante em números simples, mas exacto para fórmulas/vazio (não há "quase igual"
// nesses casos).
function cellsEqual(a: string, b: string): boolean {
  if (a === b) return true
  const na = Number(a), nb = Number(b)
  if (!isNaN(na) && !isNaN(nb) && a !== '' && b !== '') return Math.abs(na - nb) < 0.005
  return false
}

type SyncResult = { ok: boolean; message: string }

// Sincroniza o mês corrente + 2 anteriores (janela pequena, para apanhar facturas com atraso —
// ex: Água é bimestral — e pagamentos de Empregada/SS, que só chegam no mês seguinte ao de
// referência) da sheet "CustosCasa" com os débitos directos conhecidos da conta Familiar. Só
// escreve nas colunas Renda/Seguros/Condomínio/Água/Luz/Gás/TV/Empregada (F,G,H,J,K,L,M,N) —
// nunca em A-E (fórmulas do Filipe), IMI (fora de âmbito), Acerto (ajuste manual) nem nas
// colunas de totais (P+).
export async function syncCustosCasa(userId: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: config } = await supabaseAdmin
    .from('custos_casa_config').select('*').eq('user_id', userId).maybeSingle()
  if (!config) return { ok: true, message: 'Custos Casa não ligado — nada a fazer' }

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) {
    const result: SyncResult = { ok: false, message: 'Drive não ligada ou token inválido' }
    await notifyResult(userId, result)
    return result
  }

  try {
    const result = await runSync(userId, config, accessToken)
    await notifyResult(userId, result)
    return result
  } catch (err: any) {
    const result: SyncResult = { ok: false, message: err.message || 'Erro interno' }
    await notifyResult(userId, result)
    return result
  }
}

// Notifica sempre — sucesso ou falha, manual ou cron — tal como já acontece para EB/T212/Drive
// (pedido do Filipe, 2026-08-13: quer ver isto na notificação diária e nas sincronizações
// manuais, não só quando falha). Nunca faz a sincronização falhar por a notificação falhar.
async function notifyResult(userId: string, result: SyncResult) {
  await createNotification({
    userId,
    type: result.ok ? 'import_success' : 'import_error',
    title: result.ok ? 'Custos Casa sincronizado' : 'Custos Casa — falha na sincronização',
    body: result.message,
    meta: {},
  }).catch(() => {})
}

async function runSync(userId: string, config: any, accessToken: string): Promise<SyncResult> {
  const supabaseAdmin = getSupabaseAdmin()
  const targetMonths = monthsBack(2)
  const oldestMonth = targetMonths[targetMonths.length - 1]
  const startDate = `${oldestMonth.slice(0, 4)}-${oldestMonth.slice(4, 6)}-01`

  const { data: accs } = await supabaseAdmin.from('accounts').select('id').eq('budget_tag', 'familiar')
  const accIds = (accs ?? []).map((a: any) => a.id)
  const { data: txns } = await supabaseAdmin.from('transactions').select('data,valor,descritivo,categoria')
    .in('account_id', accIds).is('imovel_id', null).lt('valor', 0).gte('data', startDate)
    .in('categoria', CATEGORIAS_ELEGIVEIS)

  const sums = new Map<string, Map<Bucket, number[]>>()
  const addSum = (mes: string, bucket: Bucket, valor: number) => {
    if (!targetMonths.includes(mes)) return
    if (!sums.has(mes)) sums.set(mes, new Map())
    const monthMap = sums.get(mes)!
    if (!monthMap.has(bucket)) monthMap.set(bucket, [])
    monthMap.get(bucket)!.push(valor)
  }
  for (const t of (txns ?? []) as { data: string, valor: number, descritivo: string | null, categoria: string | null }[]) {
    const txnMonth = t.data.slice(0, 4) + t.data.slice(5, 7)
    const day = Number(t.data.slice(8, 10))
    const desc = normalize(t.descritivo ?? '')
    const valorAbs = Math.abs(Number(t.valor))

    const rule = RULES.find(r => r.match.test(desc) && r.categorias.includes(t.categoria ?? ''))
    if (rule) { addSum(txnMonth, rule.bucket, valorAbs); continue }
    // Ordenado/SS só têm sido vistos em categoria=Habitação — mais um filtro de rigor além do
    // texto, para nunca confundir com algo parecido categorizado como Utilities (pedido do
    // Filipe, 2026-08-13).
    if (t.categoria !== 'Habitação') continue
    if (ORDENADO_MATCH.test(desc)) { addSum(day <= 7 ? prevMonth(txnMonth) : txnMonth, 'N', valorAbs); continue }
    if (SS_MATCH.test(desc)) { addSum(prevMonth(txnMonth), 'N', valorAbs); continue }
  }

  const sheetRange = encodeURIComponent(config.sheet_title)
  // Localiza a linha de cada mês-alvo pela coluna E (que já é a fonte da verdade do layout —
  // a sheet vem pré-criada pelo Filipe com o esqueleto de meses até 2037).
  const colE = await sheetsFetch(`/${config.spreadsheet_id}/values/${sheetRange}!E1:E300`, accessToken)
  const eValues: string[][] = colE.values ?? []
  const rowForMonth = new Map<string, number>()
  eValues.forEach((r, i) => { if (targetMonths.includes(r[0])) rowForMonth.set(r[0], i + 1) })

  // Lê o valor actual (fórmula/número em bruto, não formatado) de cada linha-alvo, para
  // comparar com o que a app escreveu da última vez (`cell_snapshot`) — só assim se distingue
  // "ninguém mexeu, recalcula" de "o Filipe corrigiu isto à mão, nunca mais tocar" sem precisar
  // de nenhuma interacção dele (pedido do Filipe, 2026-08-13: sync 100% automático via cron, mas
  // sem sobrescrever correcções manuais, ex: um pagamento de SS feito por engano noutro banco).
  const rowsList = targetMonths.map(m => ({ mes: m, row: rowForMonth.get(m) })).filter((x): x is { mes: string, row: number } => !!x.row)
  const currentByMonth = new Map<string, string[]>()
  if (rowsList.length > 0) {
    const rangesParam = rowsList.map(x => `ranges=${encodeURIComponent(`${config.sheet_title}!F${x.row}:N${x.row}`)}`).join('&')
    const currentRaw = await sheetsFetch(`/${config.spreadsheet_id}/values:batchGet?${rangesParam}&valueRenderOption=FORMULA`, accessToken)
    const valueRanges: { values?: any[][] }[] = currentRaw.valueRanges ?? []
    rowsList.forEach((x, i) => { currentByMonth.set(x.mes, (valueRanges[i]?.values?.[0] ?? []).map((v: any) => String(v ?? ''))) })
  }
  const snapshot: Record<string, Record<string, string>> = config.cell_snapshot ?? {}
  const newSnapshot: Record<string, Record<string, string>> = { ...snapshot }

  const updates: { range: string, values: (string | number)[][] }[] = []
  const filledCells: { row: number, col: number }[] = []
  let touchedRows = 0
  let skippedCells = 0
  for (const { mes, row } of rowsList) {
    const monthMap = sums.get(mes) ?? new Map<Bucket, number[]>()
    const currentRow = currentByMonth.get(mes) ?? []
    const lastWritten = snapshot[mes] ?? {}
    const monthSnapshot: Record<string, string> = {}
    let rowTouched = false

    for (const b of BUCKETS) {
      const computed = toCell(monthMap.get(b) ?? [])
      const computedStr = String(computed)
      const current = currentRow[BUCKET_COL[b] - 5] ?? ''
      // Sem registo anterior (1ª vez que esta célula passa por aqui, ex: logo a seguir a este
      // deploy) não há como saber se o valor já lá presente é automático ou manual — assume-se
      // manual sempre que já tem conteúdo e não bate com o que calculamos agora (mais seguro do
      // que arriscar apagar uma correcção só porque ainda não a tínhamos visto); célula vazia ou
      // já correcta não levanta dúvida nenhuma.
      const hasBaseline = Object.prototype.hasOwnProperty.call(lastWritten, b)
      const manuallyChanged = hasBaseline
        ? !cellsEqual(current, lastWritten[b])
        : (current !== '' && !cellsEqual(current, computedStr))

      if (manuallyChanged) {
        // O Filipe mexeu nesta célula desde a última sincronização — respeita para sempre,
        // não escreve por cima. Actualiza a base para continuar a reconhecer o valor dele.
        monthSnapshot[b] = current
        skippedCells++
        continue
      }
      monthSnapshot[b] = computedStr
      if (!cellsEqual(current, computedStr)) {
        updates.push({ range: `${sheetRange}!${b}${row}`, values: [[computed]] })
        rowTouched = true
      }
      if (computedStr !== '') filledCells.push({ row, col: BUCKET_COL[b] })
    }
    newSnapshot[mes] = monthSnapshot
    if (rowTouched) touchedRows++
  }

  if (updates.length > 0) {
    await sheetsFetch(`/${config.spreadsheet_id}/values:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
    })
    await colorCellsBlue(config.spreadsheet_id, config.sheet_title, filledCells, accessToken)
  }

  await supabaseAdmin.from('custos_casa_config')
    .update({ last_synced_at: new Date().toISOString(), cell_snapshot: newSnapshot }).eq('user_id', userId)

  return {
    ok: true,
    message: `${touchedRows} mês(es) actualizados, ${skippedCells} célula(s) manual(is) respeitada(s) (${targetMonths[0]} a ${oldestMonth})`,
  }
}

// Corre a sincronização para todos os users que já ligaram um ficheiro — usado pelo cron.
// syncCustosCasa já notifica sempre (sucesso ou falha) por conta própria — não repetir aqui.
export async function syncCustosCasaForAllUsers(): Promise<{ userId: string; result: SyncResult }[]> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: configs } = await supabaseAdmin.from('custos_casa_config').select('user_id')
  const results = []
  for (const c of configs ?? []) {
    const result = await syncCustosCasa(c.user_id)
    results.push({ userId: c.user_id, result })
  }
  return results
}
