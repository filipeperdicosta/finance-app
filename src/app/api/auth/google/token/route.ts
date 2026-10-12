import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'
import { requireUser } from '@/lib/requireUser'

// Devolve um access_token Drive válido para o utilizador autenticado — usado só client-side
// para inicializar o Google Picker (nunca guardado, descartado logo após a selecção do
// ficheiro). O utilizador vem da sessão (Authorization: Bearer), nunca de um parâmetro.
// GET /api/auth/google/token
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth

  const accessToken = await getValidAccessToken(auth.userId)
  if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

  return NextResponse.json({ access_token: accessToken })
}
