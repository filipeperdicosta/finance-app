import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/googleDrive'

// Devolve o estado das sessões Enable Banking do utilizador
// GET /api/enablebanking/status?user_id=...
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: sessions } = await supabaseAdmin
    .from('enablebanking_sessions')
    .select('*, enablebanking_accounts(*)')
    .eq('user_id', userId)

  return NextResponse.json({
    connected: (sessions ?? []).length > 0,
    sessions: (sessions ?? []).map(s => ({
      bank_name: s.bank_name,
      bank_country: s.bank_country,
      valid_until: s.valid_until,
      expired: new Date(s.valid_until) < new Date(),
      accounts: (s.enablebanking_accounts as any[]) ?? [],
    })),
  })
}
