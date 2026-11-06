// Recuperar password — o pedido do email e a volta pelo link.
//
// O link que o Supabase envia é "implícito": traz a sessão no fragmento do endereço
// (#access_token=…&refresh_token=…&type=recovery), por isso funciona em qualquer aparelho
// ou browser. O link PKCE normal só completa no browser que o pediu (a chave fica lá
// guardada), e no iPhone o link do email abre no Safari, não na app instalada.
// O cliente principal é PKCE (o @supabase/ssr força-o) e recusa links implícitos, por isso:
//  - o pedido faz-se com um cliente à parte, em modo implícito (requestPasswordRecovery);
//  - o fragmento do link é lido aqui, à mão (mais abaixo).
//
// Essa leitura corre quando este módulo carrega — antes de o React arrancar — porque o
// auth-js não repete eventos a quem se subscreve tarde: se esperássemos pelo useEffect do
// Page, o utilizador podia cair no dashboard sem nunca ver o ecrã "Nova password".
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type RecoveryState = { pending: boolean; linkError: unknown | null }

const NONE: RecoveryState = { pending: false, linkError: null }
let state: RecoveryState = NONE
const listeners = new Set<() => void>()
const set = (next: RecoveryState) => { state = next; listeners.forEach(l => l()) }

// Para useSyncExternalStore
export const getRecoveryState = () => state
export const getServerRecoveryState = () => NONE
export const subscribeRecovery = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const clearRecovery = () => set(NONE)

// Pede o email de recuperação. Cliente à parte, sem sessão nem armazenamento: só serve para
// este pedido e nunca toca na sessão de quem está (ou não) autenticado.
let requestClient: ReturnType<typeof createClient> | null = null
export function requestPasswordRecovery(email: string) {
  requestClient ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bio-recover' },
  })
  return requestClient.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
}

if (typeof window !== 'undefined') {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const accessToken = h.get('access_token')
  const refreshToken = h.get('refresh_token')
  if (h.get('type') === 'recovery' && accessToken && refreshToken) {
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      set(error ? { pending: false, linkError: error } : { pending: true, linkError: null })
    })
  } else if (h.get('error_code') || h.get('error_description')) {
    // ex.: #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
    set({ pending: false, linkError: { code: h.get('error_code') ?? undefined, message: h.get('error_description') ?? undefined } })
  }
}
