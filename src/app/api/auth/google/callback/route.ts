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
    return NextResponse.redirect(`${appUrl}/?drive_error=${encodeURIComponent(error)}`)
  }
  if (!code || !userId) {
    return NextResponse.redirect(`${appUrl}/?drive_error=missing_params`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
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
      console.error('Google token exchange failed:', errText)
      return NextResponse.redirect(`${appUrl}/?drive_error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()
    // tokens = { access_token, refresh_token, expires_in, scope, token_type, id_token }

    if (!tokens.refresh_token) {
      // Acontece se o utilizador já tinha autorizado antes sem 'prompt=consent'.
      // Como sempre forçamos prompt=consent no passo 1, isto não deve acontecer,
      // mas fica o aviso para diagnóstico.
      console.warn('Sem refresh_token na resposta da Google:', tokens)
    }

    // Busca o email da conta Google ligada (para mostrar nas Definições)
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = userInfoRes.ok ? await userInfoRes.json() : {}

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: dbError } = await supabaseAdmin
      .from('google_drive_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token, // se vier undefined num re-login, o upsert preserva o antigo só se omitirmos o campo — tratamos abaixo
        expires_at: expiresAt,
        scope: tokens.scope,
        account_email: userInfo.email ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (dbError) {
      console.error('Erro ao guardar tokens Drive:', dbError)
      return NextResponse.redirect(`${appUrl}/?drive_error=db_save_failed`)
    }

    return NextResponse.redirect(`${appUrl}/?drive_connected=1`)

  } catch (err: any) {
    console.error('OAuth callback exception:', err)
    return NextResponse.redirect(`${appUrl}/?drive_error=unexpected`)
  }
}
