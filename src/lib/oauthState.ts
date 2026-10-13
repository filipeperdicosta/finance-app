import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// `state` assinado para os fluxos OAuth (Google Drive, Enable Banking).
// Os callbacks são redirecções do browser (sem cabeçalho Authorization), por isso a identidade
// do utilizador viaja no `state` — assinada com HMAC e com expiração, para não poder ser forjada.
// A chave deriva da service role key (já existe no servidor; não obriga a novas variáveis de ambiente).
type Purpose = 'google' | 'eb'
const TTL_MS = 10 * 60 * 1000

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY em falta')
  return createHmac('sha256', secret).update('oauth-state-v1').digest()
}

const sign = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url')

export function signState(userId: string, purpose: Purpose): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: purpose, e: Date.now() + TTL_MS, n: randomBytes(8).toString('hex') })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

// Devolve o user_id se a assinatura, a finalidade e a validade estiverem correctas; senão null.
export function verifyState(state: string | null, purpose: Purpose): string | null {
  if (!state) return null
  const [payload, sig, ...rest] = state.split('.')
  if (!payload || !sig || rest.length) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const { u, p, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (p !== purpose || typeof u !== 'string' || typeof e !== 'number' || Date.now() > e) return null
    return u
  } catch { return null }
}
