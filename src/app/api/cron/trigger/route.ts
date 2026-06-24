import { NextRequest, NextResponse } from 'next/server'

// Dispara o cron manualmente para testes.
// Requer o mesmo CRON_SECRET para autenticar.
// POST /api/cron/trigger  body: { secret }
export async function POST(req: NextRequest) {
  const { secret } = await req.json()
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://finance-app-six-flax.vercel.app'
  const res = await fetch(`${appUrl}/api/cron/check-drive`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  const data = await res.json()
  return NextResponse.json(data)
}
