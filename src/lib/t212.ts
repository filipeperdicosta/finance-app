// Helper partilhado para chamadas à API do Trading 212
// Autenticação: HTTP Basic Auth com API_KEY:API_SECRET em Base64
// Permissões necessárias: Account data + Portfolio (sem History)

const T212_BASE = 'https://live.trading212.com/api/v0'

function getAuthHeader(apiKey: string, apiSecret: string): string {
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return `Basic ${encoded}`
}

export type T212AccountConfig = {
  label: string       // 'Invest' ou 'ISA'
  apiKey: string
  apiSecret: string
}

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

export async function t212Fetch(path: string, config: T212AccountConfig) {
  const res = await fetch(`${T212_BASE}${path}`, {
    headers: { Authorization: getAuthHeader(config.apiKey, config.apiSecret) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`T212 API ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

export type T212Portfolio = {
  cash: number        // cash livre disponível
  invested: number    // valor investido ao preço de compra
  marketValue: number // valor actual das posições (invested + ppl)
  ppl: number         // P&L: ganho/perda não realizado
  total: number       // cash + marketValue = valor total da conta
}

// Usa apenas /equity/account/cash — não requer permissão History.
// Este endpoint já devolve tudo convertido para EUR, sem risco de misturar moedas.
export async function getT212Portfolio(config: T212AccountConfig): Promise<T212Portfolio> {
  const cash = await t212Fetch('/equity/account/cash', config)
  const free = Number(cash.free) || 0
  const invested = Number(cash.invested) || 0
  const ppl = Number(cash.ppl) || 0
  const marketValue = invested + ppl
  return { cash: free, invested, marketValue, ppl, total: free + marketValue }
}
