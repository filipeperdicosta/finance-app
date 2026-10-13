import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/requireUser'
import { signState } from '@/lib/oauthState'

// Inicia o fluxo OAuth: redireciona o utilizador para o ecrã de consentimento da Google.
// Exige sessão (Authorization: Bearer) e devolve { url } — o cliente é que navega para lá.
// O state é assinado (HMAC + expiração) e leva o user_id verificado, para o callback saber a quem associar o token.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Configuração Google OAuth em falta no servidor' }, { status: 500 })
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // drive.readonly: extractos bancários (PDF), navegação ampla de pastas.
    // drive.file: acesso de escrita, mas só a ficheiros que o utilizador seleccione
    // explicitamente via Picker nesta app (ex: a sheet "LedgerAuto" do IRS) — nunca a
    // toda a Drive, ao contrário de um scope 'spreadsheets' largo.
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',     // necessário para receber refresh_token
    prompt: 'consent',          // força mostrar o consentimento (garante refresh_token mesmo em re-ligações)
    state: signState(auth.userId, 'google'),
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return NextResponse.json({ url: authUrl })
}
