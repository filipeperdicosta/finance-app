import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Recebe o utilizador de volta da Google com um "code" temporário,
// troca-o por access_token + refresh_token, e guarda na base de dados.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state') // veio do passo anterior
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://finance-app-six-flax.vercel.app'

  if (error) {
    console.error('Google retornou erro no callback:', error)
    return NextResponse.redirect(`${appUrl}/?drive_error=${encodeURIComponent(error)}`)
  }
  if (!code || !userId) {
    console.error('Callback sem code ou userId:', { code: !!code, userId: !!userId })
    return NextResponse.redirect(`${appUrl}/?drive_error=missing_params`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    console.error('Configuração Google em falta no servidor:', { hasClientId: !!clientId, hasClientSecret: !!clientSecret, hasRedirectUri: !!redirectUri })
    return NextResponse.redirect(`${appUrl}/?drive_error=server_config`)
  }

  try {
    // Troca o code por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('Google token exchange failed:', tokenRes.status, errText)
      return NextResponse.redirect(`${appUrl}/?drive_error=${encodeURIComponent('token_exchange:'+tokenRes.status)}`)
    }

    const tokens = await tokenRes.json()
    // tokens = { access_token, refresh_token, expires_in, scope, token_type, id_token }
    console.log('Token exchange OK. Campos recebidos:', Object.keys(tokens), 'tem refresh_token:', !!tokens.refresh_token)

    if (!tokens.refresh_token) {
      // Acontece se o utilizador já tinha autorizado antes sem 'prompt=consent' a ser respeitado,
      // ou se a app já tinha um refresh_token activo e a Google não emite um novo por defeito.
      console.warn('Sem refresh_token na resposta da Google. Scope:', tokens.scope)
    }

    // Busca o email da conta Google ligada (para mostrar nas Definições)
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = userInfoRes.ok ? await userInfoRes.json() : {}
    if (!userInfoRes.ok) console.warn('userinfo fetch falhou:', userInfoRes.status)

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      console.error('Supabase config em falta no callback:', { hasUrl: !!supabaseUrl, hasServiceKey: !!serviceKey })
      return NextResponse.redirect(`${appUrl}/?drive_error=supabase_config_missing`)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    // Se não veio refresh_token nesta troca, tenta preservar o que já existia em BD (re-ligação)
    let refreshTokenToSave = tokens.refresh_token
    if (!refreshTokenToSave) {
      const { data: existing } = await supabaseAdmin
        .from('google_drive_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .maybeSingle()
      refreshTokenToSave = existing?.refresh_token ?? null
    }

    if (!refreshTokenToSave) {
      console.error('Sem refresh_token disponível (nem novo, nem existente). Não é possível guardar a ligação de forma persistente.')
      return NextResponse.redirect(`${appUrl}/?drive_error=no_refresh_token`)
    }

    const { error: dbError } = await supabaseAdmin
      .from('google_drive_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: refreshTokenToSave,
        expires_at: expiresAt,
        scope: tokens.scope,
        account_email: userInfo.email ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (dbError) {
      console.error('Erro ao guardar tokens Drive:', JSON.stringify(dbError))
      return NextResponse.redirect(`${appUrl}/?drive_error=${encodeURIComponent('db:'+dbError.message)}`)
    }

    return NextResponse.redirect(`${appUrl}/?drive_connected=1`)

  } catch (err: any) {
    console.error('OAuth callback exception:', err?.message, err?.stack)
    return NextResponse.redirect(`${appUrl}/?drive_error=${encodeURIComponent('exception:'+(err?.message||'unknown'))}`)
  }
}
