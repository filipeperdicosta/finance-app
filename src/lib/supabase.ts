import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ──────────────────────────────────────────────────────
export type Account = {
  id: string
  nome: string
  banco: string
  tipo: 'corrente' | 'poupança' | 'cartão' | 'corretora' | 'outro'
  budget_tag: 'familiar' | 'pessoal' | 'investimento'
  titular: string
  ownership_pct: number
  saldo_atual: number
  saldo_data: string | null
  moeda: string
  ativa: boolean
  ordem: number
  iban: string | null
  numero_conta: string | null
  drive_folder_id: string | null
  drive_folder_name: string | null
  created_at: string
}

export type Transaction = {
  id: string
  account_id: string
  data: string
  descritivo: string
  valor: number
  categoria: string | null
  subcategoria: string | null
  categoria_confirmada: boolean
  ai_confianca: number | null
  imovel_id: string | null
  imovel_classificado: boolean
  notas: string | null
  excluir_analise: boolean
  ordem_extrato: number
  created_at: string
}

export type Imovel = {
  id: string
  nome: string
  morada: string | null
  local: string | null
  tipo: string
  renda_esperada: number
  tem_hipoteca: boolean
  hipoteca_valor: number | null
  ativo: boolean
  ordem: number
  ownership_pct: number
  valorizacao: number
  valorizacao_data: string | null
}

export type ContaImovel = {
  id: string
  account_id: string
  imovel_id: string
}

export type ImovelRenda = {
  id: string
  imovel_id: string
  mes: number
  ano: number
  valor_esperado: number
  valor_recebido: number
  notas: string | null
}

// ── Data helpers ───────────────────────────────────────────────
export async function loadAllData() {
  const [accounts, transactions, imoveis, rendas, contaImovel] = await Promise.all([
    supabase.from('accounts').select('*').eq('ativa', true).order('ordem'),
    supabase.from('transactions').select('*')
      .eq('excluir_analise', false)
      .gte('data', new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().split('T')[0])
      .order('data', { ascending: false })
      .order('ordem_extrato', { ascending: true }),
    supabase.from('imoveis').select('*').order('ordem'),
    supabase.from('imovel_rendas').select('*')
      .eq('mes', new Date().getMonth() + 1)
      .eq('ano', new Date().getFullYear()),
    supabase.from('conta_imovel').select('*'),
  ])
  return {
    accounts: (accounts.data ?? []) as Account[],
    transactions: (transactions.data ?? []) as Transaction[],
    imoveis: (imoveis.data ?? []) as Imovel[],
    rendas: (rendas.data ?? []) as ImovelRenda[],
    contaImovel: (contaImovel.data ?? []) as ContaImovel[],
  }
}

// ── Imóveis CRUD ───────────────────────────────────────────────
export async function saveImovel(imovel: Omit<Imovel, 'id'>) {
  return supabase.from('imoveis').insert(imovel).select().single()
}
export async function updateImovel(id: string, fields: Partial<Omit<Imovel, 'id'>>) {
  return supabase.from('imoveis').update(fields).eq('id', id).select().single()
}
export async function deleteImovel(id: string) {
  return supabase.from('imoveis').delete().eq('id', id)
}

// ── Ligação conta ↔ imóvel ─────────────────────────────────────
export async function linkContaImovel(account_id: string, imovel_id: string) {
  return supabase.from('conta_imovel').insert({ account_id, imovel_id })
}
export async function unlinkContaImovel(account_id: string, imovel_id: string) {
  return supabase.from('conta_imovel').delete().eq('account_id', account_id).eq('imovel_id', imovel_id)
}

// ── Associar transação a imóvel ────────────────────────────────
export async function assignTransactionToImovel(txnId: string, imovelId: string | null) {
  // imovelId null => marca como "geral" (classificada mas sem imóvel)
  return supabase.from('transactions').update({
    imovel_id: imovelId,
    imovel_classificado: true,
  }).eq('id', txnId)
}
export async function assignTransactionsToImovel(txnIds: string[], imovelId: string | null) {
  return supabase.from('transactions').update({
    imovel_id: imovelId,
    imovel_classificado: true,
  }).in('id', txnIds)
}

export async function saveAccount(account: Omit<Account, 'id' | 'created_at'>) {
  return supabase.from('accounts').insert(account).select().single()
}

// Carrega TODAS as transações (para o ecrã Ver Todas, com histórico completo)
export async function loadAllTransactions() {
  // ordem_extrato como critério de desempate dentro do mesmo dia: reflecte explicitamente
  // a posição da transação no extrato original — mais fiável que created_at, que não é
  // garantidamente preservado em inserções em lote (upsert).
  const { data } = await supabase.from('transactions').select('*')
    .order('data', { ascending: false })
    .order('ordem_extrato', { ascending: true })
  return (data ?? []) as Transaction[]
}

export async function deleteAccount(id: string) {
  return supabase.from('accounts').delete().eq('id', id)
}

export async function updateAccount(id: string, fields: Partial<Omit<Account, 'id' | 'created_at'>>) {
  return supabase.from('accounts').update(fields).eq('id', id).select().single()
}

export async function updateAccountBalance(id: string, saldo: number) {
  return supabase.from('accounts').update({ saldo_atual: saldo }).eq('id', id)
}

export async function saveTransactions(txns: Omit<Transaction, 'id' | 'created_at'>[]) {
  return supabase.from('transactions').upsert(txns, { onConflict: 'hash', ignoreDuplicates: true })
}

export async function updateTransaction(id: string, fields: Partial<Omit<Transaction, 'id' | 'created_at'>>) {
  return supabase.from('transactions').update(fields).eq('id', id).select().single()
}

export async function deleteTransaction(id: string) {
  return supabase.from('transactions').delete().eq('id', id)
}

export async function deleteTransactions(ids: string[]) {
  return supabase.from('transactions').delete().in('id', ids)
}

export async function recategorizeTransactions(ids: string[], categoria: string) {
  return supabase.from('transactions').update({ categoria, categoria_confirmada: true }).in('id', ids)
}

export async function updateTransactionCategory(id: string, categoria: string) {
  return supabase.from('transactions').update({
    categoria,
    categoria_confirmada: true,
  }).eq('id', id)
}

// ── Regras de categorização (aprendizagem) ─────────────────────
export type CategoryRule = {
  id: string
  pattern: string
  categoria: string
  subcategoria: string | null
  imovel_id: string | null
  confianca: number
  vezes_usada: number
  ativa: boolean
  created_at: string
}

export async function loadCategoryRules() {
  const { data } = await supabase.from('category_rules').select('*').eq('ativa', true).order('vezes_usada', { ascending: false })
  return (data ?? []) as CategoryRule[]
}

// Extrai um "padrão" estável de um descritivo de transação (remove números/datas variáveis)
export function extractPattern(descritivo: string): string {
  return descritivo
    .toUpperCase()
    .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '')   // datas
    .replace(/\*?\d{4,}/g, '')                         // referências/cartões longos
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)                                       // primeiras 3 palavras como padrão
    .join(' ')
}

// Cria uma regra nova ou reforça uma existente (incrementa vezes_usada) para o mesmo padrão+categoria
export async function learnFromCategorization(descritivo: string, categoria: string) {
  const pattern = extractPattern(descritivo)
  if (!pattern || pattern.length < 3) return null

  const { data: existing } = await supabase
    .from('category_rules')
    .select('*')
    .eq('pattern', pattern)
    .maybeSingle()

  if (existing) {
    if (existing.categoria === categoria) {
      // Reforça a regra existente
      return supabase.from('category_rules').update({ vezes_usada: existing.vezes_usada + 1 }).eq('id', existing.id)
    } else {
      // Categoria diferente para o mesmo padrão — actualiza para a mais recente (o utilizador corrigiu)
      return supabase.from('category_rules').update({ categoria, vezes_usada: 1 }).eq('id', existing.id)
    }
  } else {
    return supabase.from('category_rules').insert({ pattern, categoria, confianca: 0.9, vezes_usada: 1, ativa: true })
  }
}

// Aplica regras conhecidas a uma lista de transações por importar; devolve a categoria sugerida ou null
export function matchRule(descritivo: string, rules: CategoryRule[]): string | null {
  const upper = descritivo.toUpperCase()
  const sorted = [...rules].sort((a, b) => b.vezes_usada - a.vezes_usada)
  for (const rule of sorted) {
    if (rule.pattern && upper.includes(rule.pattern)) return rule.categoria
  }
  return null
}

export async function deleteCategoryRule(id: string) {
  return supabase.from('category_rules').delete().eq('id', id)
}

export async function deleteCategoryRules(ids: string[]) {
  return supabase.from('category_rules').delete().in('id', ids)
}

export async function updateCategoryRule(id: string, categoria: string) {
  return supabase.from('category_rules').update({ categoria }).eq('id', id)
}

// ── Google Drive ────────────────────────────────────────────────
export type DriveToken = {
  id: string
  user_id: string
  account_email: string | null
  connected_at: string
  expires_at: string
}

export type DriveFile = {
  id: string
  account_id: string
  google_file_id: string
  filename: string
  mime_type: string | null
  modified_time: string | null
  status: 'pendente' | 'importado' | 'ignorado'
  import_batch_id: string | null
  discovered_at: string
  imported_at: string | null
}

// Estado da ligação Drive do utilizador actual (sem expor tokens ao cliente)
export async function getDriveConnectionStatus() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('google_drive_tokens')
    .select('id, user_id, account_email, connected_at, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()
  return data as DriveToken | null
}

export async function disconnectDrive() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return supabase.from('google_drive_tokens').delete().eq('user_id', user.id)
}

// URL para iniciar o fluxo OAuth (usado num <a href> ou window.location)
export async function getDriveAuthUrl() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return `/api/auth/google?user_id=${user.id}`
}

export async function updateAccountDriveFolder(accountId: string, folderId: string | null, folderName: string | null) {
  return supabase.from('accounts').update({ drive_folder_id: folderId, drive_folder_name: folderName }).eq('id', accountId)
}

export async function loadDriveFiles(accountId: string) {
  const { data } = await supabase.from('drive_files').select('*').eq('account_id', accountId).order('modified_time', { ascending: false })
  return (data ?? []) as DriveFile[]
}

// Lista ficheiros reais da pasta da Drive da conta, cruzados com o que já foi importado
export async function listDriveFolderFiles(userId: string, folderId: string) {
  const res = await fetch(`/api/drive/files?user_id=${userId}&folder_id=${folderId}`)
  const data = await res.json()
  return (data.files ?? []) as { id: string; name: string; mimeType: string; modifiedTime: string }[]
}

// Lê e processa um ficheiro da Drive (Gemini) SEM gravar nada — para rever antes de confirmar.
export async function previewDriveFile(params: { userId: string; googleFileId: string; filename: string }) {
  const res = await fetch('/api/drive/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: params.userId, google_file_id: params.googleFileId, filename: params.filename }),
  })
  return res.json()
}

// Grava transações de um ficheiro da Drive. Se "transactions" for passado, usa-as
// directamente (modo confirmado, após revisão humana) sem voltar a chamar o Gemini.
// Se omitido, processa tudo de uma vez sem pausa (modo automático — só para o cron).
export async function importDriveFile(params: {
  userId: string; accountId: string; googleFileId: string; filename: string
  triggerType?: 'manual' | 'cron' | 'on_demand'
  transactions?: { data: string; descritivo: string; valor: number; categoria: string }[]
  meta?: { saldo_final: number | null; iban: string | null; numero_conta: string | null; periodo_fim: string | null }
}) {
  const res = await fetch('/api/drive/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: params.userId, account_id: params.accountId,
      google_file_id: params.googleFileId, filename: params.filename,
      trigger_type: params.triggerType ?? 'on_demand',
      transactions: params.transactions, meta: params.meta,
    }),
  })
  return res.json()
}

// Remove o registo de "já importado" de um ficheiro, permitindo voltar a processá-lo
// (útil depois de apagares transações por engano, ou para corrigir um import com erro).
// Não apaga as transações já guardadas — isso faz-se à parte, no ecrã de transações.
export async function resetDriveFileImport(accountId: string, googleFileId: string) {
  return supabase.from('drive_files').delete().eq('account_id', accountId).eq('google_file_id', googleFileId)
}

// ── Notificações ─────────────────────────────────────────────────
export type AppNotification = {
  id: string
  user_id: string
  type: 'import_success' | 'import_error' | 'cron_summary' | 'manual_import'
  title: string
  body: string | null
  meta: Record<string, any> | null
  read: boolean
  created_at: string
}

export async function loadNotifications(limit = 50) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AppNotification[]
}

export async function countUnreadNotifications() {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false)
  return count ?? 0
}

export async function markNotificationsRead(ids?: string[]) {
  const q = supabase.from('notifications').update({ read: true })
  if (ids?.length) return q.in('id', ids)
  return q.eq('read', false) // marca todas
}

export async function deleteNotification(id: string) {
  return supabase.from('notifications').delete().eq('id', id)
}

// ── Enable Banking ────────────────────────────────────────────────
export async function getEnableBankingStatus() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { connected: false, sessions: [] }
  const res = await fetch(`/api/enablebanking/status?user_id=${user.id}`)
  return res.json()
}

export async function startEnableBankingConnect(bank: string, country: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return `/api/auth/enablebanking?user_id=${user.id}&bank=${encodeURIComponent(bank)}&country=${country}`
}

export async function syncEnableBanking(accountUid?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const res = await fetch('/api/enablebanking/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, ...(accountUid ? { account_uid: accountUid } : {}) }),
  })
  return res.json()
}

export async function linkEnableBankingAccount(accountUid: string, appAccountId: string) {
  return supabase.from('enablebanking_accounts')
    .update({ account_id: appAccountId })
    .eq('account_uid', accountUid)
}
export type T212Config = {
  id: string
  user_id: string
  account_id: string
  label: string
}

export async function loadT212Config() {
  const { data } = await supabase.from('t212_config').select('*')
  return (data ?? []) as T212Config[]
}

export async function saveT212Config(accountId: string, label: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  return supabase.from('t212_config').upsert(
    { user_id: user.id, account_id: accountId, label },
    { onConflict: 'user_id,label' }
  )
}

export async function syncT212(accountId: string, label = 'Invest') {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const res = await fetch('/api/t212/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, account_id: accountId, label }),
  })
  return res.json()
}

export async function getT212Status() {
  const res = await fetch('/api/t212/status')
  return res.json()
}
