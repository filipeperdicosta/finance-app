import { NextRequest, NextResponse } from 'next/server'
import { getT212Configs, getT212Portfolio } from '@/lib/t212'

// Devolve snapshot do portfolio T212 em tempo real (sem gravar nada)
// GET /api/t212/status
export async function GET(_req: NextRequest) {
  const configs = getT212Configs()
  if (!configs.length) {
    return NextResponse.json({ connected: false, accounts: [] })
  }

  const accounts = await Promise.all(
    configs.map(async config => {
      try {
        const portfolio = await getT212Portfolio(config)
        return { label: config.label, ...portfolio, error: null }
      } catch (err: any) {
        return { label: config.label, error: err.message, total: null }
      }
    })
  )

  return NextResponse.json({ connected: true, accounts })
}
