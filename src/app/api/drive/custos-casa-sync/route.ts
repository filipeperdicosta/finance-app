import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/requireUser'
import { syncCustosCasa } from '@/lib/custosCasaSync'

// Sincroniza a sheet "CustosCasa" do ficheiro ligado pelo utilizador com os débitos directos
// conhecidos da conta Familiar — chamado pelo botão "Sincronizar agora" (DriveSettingsScreen).
// POST /api/drive/custos-casa-sync  body: { user_id }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    body.user_id = auth.userId
    const { user_id } = body
    if (!user_id) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

    const result = await syncCustosCasa(user_id)
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 })
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Custos Casa sync exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
