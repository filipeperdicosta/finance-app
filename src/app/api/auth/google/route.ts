import { NextRequest, NextResponse } from 'next/server'

// Inicia o fluxo OAuth: redireciona o utilizador para o ecrã de consentimento da Google.
// O state carrega o user_id (Supabase) para sabermos a quem associar o token no callback.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) {
    return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Configuração Google OAuth em falta no servidor' }, { status: 500 })
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    access_type: 'offline',     // necessário para receber refresh_token
    prompt: 'consent',          // força mostrar o consentimento (garante refresh_token mesmo em re-ligações)
    state: userId,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
