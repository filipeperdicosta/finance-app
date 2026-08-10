import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'

// Devolve um access_token Drive válido para o utilizador — usado só client-side para
// inicializar o Google Picker (nunca guardado, descartado logo após a selecção do
// ficheiro). Mesmo padrão de confiança no user_id que o resto das rotas desta app (app
// pessoal, 2 utilizadores) — não há verificação de sessão aqui.
// GET /api/auth/google/token?user_id=...
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

  return NextResponse.json({ access_token: accessToken })
}
