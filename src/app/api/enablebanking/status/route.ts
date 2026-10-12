import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/requireUser'
import { getSupabaseAdmin } from '@/lib/googleDrive'

// Devolve o estado das sessões Enable Banking do utilizador
// GET /api/enablebanking/status?user_id=...
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const userId = auth.userId

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
