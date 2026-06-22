import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null

// Criação adiada (lazy) — evita que o build do Next.js falhe se a env var
// ainda não estiver disponível no momento de "collecting page data".
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('Configuração Supabase em falta (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    }
    _supabaseAdmin = createClient(url, key)
  }
  return _supabaseAdmin
}

// Devolve um access_token válido para o utilizador, renovando-o se estiver expirado.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: tokenRow, error } = await supabaseAdmin
    .from('google_drive_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !tokenRow) return null

  const expiresAt = new Date(tokenRow.expires_at).getTime()
  const now = Date.now()
  const stillValid = expiresAt - now > 60_000 // margem de 1 minuto

  if (stillValid) return tokenRow.access_token

  // Token expirado — renova usando o refresh_token
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret || !tokenRow.refresh_token) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('Falha ao renovar token Drive:', await res.text())
    return null
  }

  const fresh = await res.json()
  const newExpiresAt = new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString()

  await supabaseAdmin
    .from('google_drive_tokens')
    .update({ access_token: fresh.access_token, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return fresh.access_token
}

export { getSupabaseAdmin }

// ── Notificações ─────────────────────────────────────────────────
// Cria uma notificação persistente para o utilizador.
// Chamada pelas rotas de servidor após imports (manual, Drive, cron).
export async function createNotification(params: {
  userId: string
  type: 'import_success' | 'import_error' | 'cron_summary' | 'manual_import'
  title: string
  body?: string
  meta?: Record<string, any>
}) {
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    meta: params.meta ?? null,
  })
  if (error) console.error('Erro ao criar notificação:', error)
}
