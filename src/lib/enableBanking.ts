// Helper para chamadas à API do Enable Banking
// Autenticação: JWT assinado com chave RSA privada (RS256)

const EB_API = 'https://api.enablebanking.com'

// Gera um JWT para autenticar cada pedido à API do Enable Banking
// O JWT é assinado com a chave RSA privada da aplicação
async function generateJWT(): Promise<string> {
  const appId = process.env.ENABLEBANKING_APP_ID
  const privateKeyPem = process.env.ENABLEBANKING_PRIVATE_KEY
  if (!appId || !privateKeyPem) {
    throw new Error('ENABLEBANKING_APP_ID ou ENABLEBANKING_PRIVATE_KEY não configurados')
  }

  // Importa a chave privada RSA via Web Crypto API (disponível em Node.js 18+/Edge runtime)
  const privateKeyDer = pemToBuffer(privateKeyPem)
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'RS256', kid: appId }
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  )

  const sigB64 = Buffer.from(signature).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${signingInput}.${sigB64}`
}

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function pemToBuffer(pem: string): ArrayBuffer {
  // Remove cabeçalho/rodapé PEM e converte base64 para binary
  const base64 = pem
    .replace(/-----BEGIN .*?-----/g, '')
    .replace(/-----END .*?-----/g, '')
    .replace(/\s/g, '')
  const binary = Buffer.from(base64, 'base64')
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer
}

// Fetch genérico autenticado para a API do Enable Banking
export async function ebFetch(path: string, options: RequestInit = {}) {
  const jwt = await generateJWT()
  const res = await fetch(`${EB_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Enable Banking ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

// Inicia o fluxo de autorização com um banco específico
// Devolve o URL para onde redirecionar o utilizador
export async function startEnableBankingAuth(params: {
  bankName: string        // ex: "Revolut"
  bankCountry: string     // ex: "PT"
  redirectUrl: string
  state: string           // identificador único desta sessão de auth (user_id)
  validDays?: number      // dias de validade do acesso (default: 180)
}): Promise<string> {
  const validUntil = new Date(Date.now() + (params.validDays ?? 180) * 24 * 60 * 60 * 1000)
  const body = {
    access: {
      valid_until: validUntil.toISOString(),
      balances: true,
      transactions: true,
    },
    aspsp: {
      name: params.bankName,
      country: params.bankCountry,
    },
    state: params.state,
    redirect_url: params.redirectUrl,
    psu_type: 'personal',
  }
  const data = await ebFetch('/auth', { method: 'POST', body: JSON.stringify(body) })
  return data.url
}

// Troca o code (recebido no callback) por uma sessão com os IDs das contas
export async function createEnableBankingSession(code: string) {
  return ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) })
}

// Busca o saldo de uma conta específica
export async function getEnableBankingBalance(accountUid: string) {
  const data = await ebFetch(`/accounts/${accountUid}/balances`)
  // Devolve o saldo mais recente disponível
  const balances: any[] = data.balances ?? []
  // Preferência: CLBD (closing booked) > XPCD (expected) > primeiro disponível
  const preferred = balances.find((b: any) => b.balance_type === 'CLBD')
    ?? balances.find((b: any) => b.balance_type === 'XPCD')
    ?? balances[0]
  return preferred ? Number(preferred.balance_amount?.amount) : null
}

// Busca transacções de uma conta
// MCC (Merchant Category Code) → categoria da app
// Fonte: ISO 18245 + categorias comuns do Revolut
const MCC_MAP: Record<string, string> = {
  // Restauração
  '5812': 'Restauração', '5813': 'Restauração', '5814': 'Restauração',
  '5811': 'Restauração', '5441': 'Restauração', '5462': 'Restauração',
  '5499': 'Restauração', '5921': 'Restauração',
  // Compras / Supermercado
  '5411': 'Compras', '5412': 'Compras', '5451': 'Compras',
  '5311': 'Compras', '5331': 'Compras', '5999': 'Compras',
  '5732': 'Compras', '5734': 'Compras', '5945': 'Compras',
  '5200': 'Compras', '5251': 'Compras', '5261': 'Compras',
  '5065': 'Compras', '5072': 'Compras', '5085': 'Compras',
  '5940': 'Compras', '5941': 'Compras', '5942': 'Compras',
  '5943': 'Compras', '5944': 'Compras', '5947': 'Compras',
  '5948': 'Compras', '5949': 'Compras', '5977': 'Compras',
  // Transportes
  '5541': 'Transportes', '5542': 'Transportes',
  '4111': 'Transportes', '4112': 'Transportes', '4121': 'Transportes',
  '4131': 'Transportes', '4784': 'Transportes', '7523': 'Transportes',
  '7511': 'Transportes', '4789': 'Transportes',
  // Viagens
  '7011': 'Viagens', '4411': 'Viagens', '4511': 'Viagens',
  '7512': 'Viagens', '7513': 'Viagens', '4722': 'Viagens',
  '4723': 'Viagens', '3000': 'Viagens', '3001': 'Viagens',
  // Saúde
  '5912': 'Saúde', '8011': 'Saúde', '8021': 'Saúde',
  '8049': 'Saúde', '8099': 'Saúde', '8000': 'Saúde',
  '8050': 'Saúde', '5047': 'Saúde', '5122': 'Saúde',
  // Lazer / Entretenimento
  '7922': 'Lazer', '7832': 'Lazer', '7993': 'Lazer',
  '7999': 'Lazer', '7941': 'Lazer', '7991': 'Lazer',
  '7996': 'Lazer', '7997': 'Lazer', '7998': 'Lazer',
  '5815': 'Lazer', '5816': 'Lazer', '5817': 'Lazer', '5818': 'Lazer',
  // Subscrições / Serviços digitais
  '4899': 'Subscrições', '7372': 'Subscrições', '7374': 'Subscrições',
  '7379': 'Subscrições', '5045': 'Subscrições',
  // Utilities / Casa
  '4814': 'Utilities', '4811': 'Utilities', '4900': 'Utilities',
  '4911': 'Utilities', '4941': 'Utilities', '4952': 'Utilities',
  '4961': 'Utilities', '4971': 'Utilities',
  // Habitação
  '6513': 'Habitação', '1520': 'Habitação', '1711': 'Habitação',
  '1731': 'Habitação', '1750': 'Habitação', '1761': 'Habitação',
  // Transferências / Serviços financeiros
  '6011': 'Transferências', '6012': 'Transferências', '6051': 'Transferências',
  '6211': 'Transferências', '6099': 'Transferências',
}

// Palavras-chave no descritivo → categoria (fallback quando MCC não está disponível)
// Cobre os comerciantes mais comuns no Revolut Portugal
const KEYWORD_MAP: { pattern: RegExp; cat: string }[] = [
  // Subscrições digitais
  { pattern: /spotify|netflix|apple\.com\/bill|apple\.com|itunes|google play|youtube|disney|hbo|prime video|amazon prime|deezer|tidal/i, cat: 'Subscrições' },
  // Restauração
  { pattern: /restaurant|restauran|cafe|café|coffee|pizza|burger|sushi|mcdonald|kfc|nando|subway|pastelaria|padaria|quiosque|tasca|taberna|cervejaria|snack|canteen|cantina|food|foods|kitchen|grill|brasserie|bistro|fortuny/i, cat: 'Restauração' },
  // Transportes
  { pattern: /uber|bolt|cabify|táxi|taxi|cp comboios|comboios|metro|carris|fertagus|via verde|rent a car|hertz|europcar|avis|sixt|parking|estacionamento/i, cat: 'Transportes' },
  // Compras / Supermercado
  { pattern: /continente|pingo doce|lidl|aldi|mercadona|jumbo|minipreço|intermarche|el corte|fnac|worten|leroy merlin|ikea|zara|h&m|primark|amazon|ebay/i, cat: 'Compras' },
  // Saúde
  { pattern: /farmácia|farmacia|pharmacy|clinica|clínica|hospital|médico|medico|dentista|dental|health|saúde/i, cat: 'Saúde' },
  // Utilities
  { pattern: /edp|galp|endesa|nos |meo |vodafone|nos fixo|internet|água|agua|gas |gás |electricidade|electric/i, cat: 'Utilities' },
  // Habitação
  { pattern: /renda|arrendamento|condominio|condomínio|imóvel|imovel|rent |aluguer/i, cat: 'Habitação' },
  // Lazer
  { pattern: /cinema|teatro|museu|museum|concert|concerto|ginásio|ginasio|gym|sport|fitness|clube|club|lazer/i, cat: 'Lazer' },
  // Viagens
  { pattern: /hotel|hostel|airbnb|booking\.com|expedia|ryanair|easyjet|tap |flixbus|comboio|train|flight|voo /i, cat: 'Viagens' },
  // Deloitte → Receita/Salário (empregador conhecido)
  { pattern: /deloitte|salary|salário|salario|vencimento|ordenado/i, cat: 'Receita' },
]

export function getMccCategory(mcc?: string): string | null {
  if (!mcc) return null
  return MCC_MAP[mcc] ?? null
}

// Tenta categorizar pelo descritivo usando palavras-chave conhecidas
// Retorna null se não encontrar correspondência (passa ao Gemini)
export function getKeywordCategory(descritivo: string, valor: number): string | null {
  if (valor >= 0) return 'Receita'
  for (const { pattern, cat } of KEYWORD_MAP) {
    if (pattern.test(descritivo)) return cat
  }
  return null
}

// Busca transacções com paginação automática via continuation_key
// dateFrom: data de início no formato YYYY-MM-DD
export async function getEnableBankingTransactions(accountUid: string, dateFrom?: string): Promise<any[]> {
  const all: any[] = []
  const baseParams = dateFrom ? `?date_from=${dateFrom}` : ''
  let url = `/accounts/${accountUid}/transactions${baseParams}`

  // Segurança: máximo de 10 páginas (500 transacções) por sync
  let pages = 0
  while (url && pages < 10) {
    const data = await ebFetch(url)
    const txns = data.transactions ?? []
    all.push(...txns)
    pages++

    // Enable Banking usa continuation_key para paginação
    const key = data.continuation_key
    if (key && txns.length > 0) {
      const sep = url.includes('?') ? '&' : '?'
      url = `/accounts/${accountUid}/transactions${baseParams}${sep}continuation_key=${encodeURIComponent(key)}`
    } else {
      break
    }
  }
  return all
}
