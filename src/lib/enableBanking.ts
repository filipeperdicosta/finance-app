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
const MCC_MAP: Record<string, string> = {
  '5411': 'Compras', '5412': 'Compras', '5441': 'Compras', '5451': 'Compras',
  '5462': 'Compras', '5499': 'Compras', '5311': 'Compras', '5331': 'Compras',
  '5912': 'Saúde', '8011': 'Saúde', '8021': 'Saúde', '8049': 'Saúde', '8099': 'Saúde',
  '5812': 'Restauração', '5813': 'Restauração', '5814': 'Restauração',
  '5541': 'Transportes', '5542': 'Transportes', '4111': 'Transportes',
  '4121': 'Transportes', '4131': 'Transportes', '7011': 'Viagens',
  '4411': 'Viagens', '4511': 'Viagens', '7512': 'Viagens',
  '7922': 'Lazer', '7832': 'Lazer', '7993': 'Lazer', '7999': 'Lazer',
  '5945': 'Lazer', '5947': 'Lazer',
  '4814': 'Utilities', '4899': 'Utilities', '4911': 'Utilities', '4941': 'Utilities',
  '6011': 'Transferências', '6012': 'Transferências',
}

export function getMccCategory(mcc?: string): string | null {
  if (!mcc) return null
  return MCC_MAP[mcc] ?? null
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
