// Helper partilhado para chamadas à API do Trading 212
// Autenticação: HTTP Basic Auth com API_KEY:API_SECRET em Base64

const T212_BASE = 'https://live.trading212.com/api/v0'

function getAuthHeader(apiKey: string, apiSecret: string): string {
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return `Basic ${encoded}`
}

export type T212AccountConfig = {
  label: string       // ex: "Invest" ou "ISA"
  apiKey: string
  apiSecret: string
}

// Devolve as contas T212 configuradas (1 ou 2, consoante as env vars)
export function getT212Configs(): T212AccountConfig[] {
  const configs: T212AccountConfig[] = []
  const key = process.env.T212_API_KEY
  const secret = process.env.T212_API_SECRET
  if (key && secret) configs.push({ label: 'Invest', apiKey: key, apiSecret: secret })

  const keyIsa = process.env.T212_API_KEY_ISA
  const secretIsa = process.env.T212_API_SECRET_ISA
  if (keyIsa && secretIsa) configs.push({ label: 'ISA', apiKey: keyIsa, apiSecret: secretIsa })

  return configs
}

// Fetch genérico autenticado para a API do T212
export async function t212Fetch(path: string, config: T212AccountConfig) {
  const res = await fetch(`${T212_BASE}${path}`, {
    headers: { Authorization: getAuthHeader(config.apiKey, config.apiSecret) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`T212 API ${path} → ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// Portfolio: cash + valor de mercado das posições abertas
export async function getT212Portfolio(config: T212AccountConfig) {
  const [cash, positions] = await Promise.all([
    t212Fetch('/equity/account/cash', config),
    t212Fetch('/equity/portfolio', config),
  ])
  // cash: { free, invested, ppl (P&L), result, pieCash }
  // positions: array de { ticker, quantity, averagePrice, currentPrice, ppl, ... }
  const marketValue = (positions as any[]).reduce((s: number, p: any) =>
    s + (Number(p.currentPrice) || 0) * (Number(p.quantity) || 0), 0)
  return {
    cash: Number(cash.free) || 0,
    invested: Number(cash.invested) || 0,
    marketValue,
    ppl: Number(cash.ppl) || 0,
    total: (Number(cash.free) || 0) + marketValue,
  }
}

// Transacções em dinheiro (depósitos, levantamentos, dividendos)
// cursor-based pagination — devolve todas as transacções
export async function getT212Transactions(config: T212AccountConfig, limit = 50) {
  const items: any[] = []
  let path = `/equity/history/transactions?limit=${limit}`
  while (path) {
    const data = await t212Fetch(path, config)
    items.push(...(data.items ?? []))
    path = data.nextPagePath ?? null
  }
  return items
}
