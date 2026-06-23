import { NextRequest, NextResponse } from 'next/server'
import { createEnableBankingSession } from '@/lib/enableBanking'
import { getSupabaseAdmin } from '@/lib/googleDrive'

// Recebe o utilizador de volta do banco após autorização.
// Troca o code por uma sessão, guarda os account UIDs na BD.
// GET /api/auth/enablebanking/callback?code=...&state=user_id
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const userId = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-app-six-flax.vercel.app'

  if (error) {
    console.error('Enable Banking callback error:', error)
    return NextResponse.redirect(`${appUrl}/?eb_error=${encodeURIComponent(error)}`)
  }
  if (!code || !userId) {
    return NextResponse.redirect(`${appUrl}/?eb_error=missing_params`)
  }

  try {
    // Troca o code por uma sessão com os IDs das contas
    const session = await createEnableBankingSession(code)
    // session = { session_id, accounts: [{uid, ...}], valid_until, aspsp: {name, country} }

    const supabaseAdmin = getSupabaseAdmin()

    // Guarda/actualiza a sessão
    const { data: savedSession, error: sessionErr } = await supabaseAdmin
      .from('enablebanking_sessions')
      .upsert({
        user_id: userId,
        session_id: session.session_id ?? session.id,
        bank_name: session.aspsp?.name ?? 'Revolut',
        bank_country: session.aspsp?.country ?? 'PT',
        valid_until: session.valid_until ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id,bank_name,bank_country' })
      .select()
      .single()

    if (sessionErr) {
      console.error('Enable Banking: erro ao guardar sessão:', sessionErr)
      return NextResponse.redirect(`${appUrl}/?eb_error=db_error`)
    }

    // Guarda os account UIDs retornados
    const accounts: any[] = session.accounts ?? []
    for (const acc of accounts) {
      await supabaseAdmin.from('enablebanking_accounts').upsert({
        session_id: savedSession.id,
        user_id: userId,
        account_uid: acc.uid ?? acc,
        iban: acc.account_id?.iban ?? null,
        currency: acc.currency ?? null,
        name: acc.name ?? null,
      }, { onConflict: 'user_id,account_uid' })
    }

    console.log(`Enable Banking: ${accounts.length} conta(s) ligadas para user ${userId}`)
    return NextResponse.redirect(`${appUrl}/?eb_connected=1&bank=${encodeURIComponent(session.aspsp?.name ?? 'Banco')}`)

  } catch (err: any) {
    console.error('Enable Banking callback exception:', err.message)
    return NextResponse.redirect(`${appUrl}/?eb_error=${encodeURIComponent(err.message)}`)
  }
}
