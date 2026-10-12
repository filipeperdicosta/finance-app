import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/requireUser'
import { syncLedgerAuto } from '@/lib/ledgerSync'

// Sincroniza a sheet "LedgerAuto" do ficheiro ligado pelo utilizador com as transações de
// IRS já classificadas na app — chamado pelo botão "Sincronizar agora" (IrsResumoScreen).
// POST /api/drive/ledger-sync  body: { user_id }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    body.user_id = auth.userId
    const { user_id } = body
    if (!user_id) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

    const result = await syncLedgerAuto(user_id)
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 })
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Ledger sync exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
