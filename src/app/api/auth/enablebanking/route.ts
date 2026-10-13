import { NextRequest, NextResponse } from 'next/server'
import { startEnableBankingAuth } from '@/lib/enableBanking'
import { requireUser } from '@/lib/requireUser'
import { signState } from '@/lib/oauthState'

// Inicia o fluxo OAuth do Enable Banking para um banco específico.
// GET /api/auth/enablebanking?bank=Revolut&country=PT  (exige sessão; devolve { url })
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const bank = req.nextUrl.searchParams.get('bank') ?? 'Revolut'
  const country = req.nextUrl.searchParams.get('country') ?? 'PT'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://biofinance-alpha.vercel.app'
  const redirectUrl = `${appUrl}/api/auth/enablebanking/callback`

  try {
    const authUrl = await startEnableBankingAuth({
      bankName: bank,
      bankCountry: country,
      redirectUrl,
      state: signState(auth.userId, 'eb'), // assinado; usado no callback para saber a quem associar a sessão
    })
    return NextResponse.json({ url: authUrl })
  } catch (err: any) {
    console.error('Enable Banking auth init error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
