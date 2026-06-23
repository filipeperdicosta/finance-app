import { NextRequest, NextResponse } from 'next/server'
import { startEnableBankingAuth } from '@/lib/enableBanking'

// Inicia o fluxo OAuth do Enable Banking para um banco específico.
// GET /api/auth/enablebanking?user_id=...&bank=Revolut&country=PT
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const bank = req.nextUrl.searchParams.get('bank') ?? 'Revolut'
  const country = req.nextUrl.searchParams.get('country') ?? 'PT'

  if (!userId) {
    return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-app-six-flax.vercel.app'
  const redirectUrl = `${appUrl}/api/auth/enablebanking/callback`

  try {
    const authUrl = await startEnableBankingAuth({
      bankName: bank,
      bankCountry: country,
      redirectUrl,
      state: userId, // usado no callback para saber a quem associar a sessão
    })
    return NextResponse.redirect(authUrl)
  } catch (err: any) {
    console.error('Enable Banking auth init error:', err.message)
    return NextResponse.redirect(`${appUrl}/?eb_error=${encodeURIComponent(err.message)}`)
  }
}
