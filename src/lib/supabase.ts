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
  moeda: string
  ativa: boolean
  ordem: number
  iban: string | null
  numero_conta: string | null
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
      .order('data', { ascending: false }),
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
  const { data } = await supabase.from('transactions').select('*').order('data', { ascending: false })
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
