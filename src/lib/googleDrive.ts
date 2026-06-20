import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Devolve um access_token válido para o utilizador, renovando-o se estiver expirado.
export async function getValidAccessToken(userId: string): Promise<string | null> {
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

export { supabaseAdmin }
