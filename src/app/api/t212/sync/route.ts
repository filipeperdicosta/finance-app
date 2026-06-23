import { NextRequest, NextResponse } from 'next/server'
import { getT212Configs, getT212Portfolio } from '@/lib/t212'
import { getSupabaseAdmin, createNotification } from '@/lib/googleDrive'

// Sincroniza o saldo do portfolio T212 para a conta da app associada.
// Apenas actualiza o saldo — não importa transacções (não requer permissão History).
// POST /api/t212/sync  body: { user_id, account_id, label? }
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
    const { user_id, account_id, label } = body
    if (!user_id || !account_id) {
      return NextResponse.json({ error: 'user_id e account_id são obrigatórios' }, { status: 400 })
    }

    const allConfigs = getT212Configs()
    if (!allConfigs.length) {
      return NextResponse.json({ error: 'Credenciais T212 não configuradas no servidor' }, { status: 500 })
    }

    const configs = label ? allConfigs.filter(c => c.label === label) : allConfigs
    if (!configs.length) {
      return NextResponse.json({ error: `Config T212 "${label}" não encontrada` }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Guarda a configuração persistente (conta da app ↔ label T212)
    await supabaseAdmin.from('t212_config').upsert(
      { user_id, account_id, label: configs[0].label },
      { onConflict: 'user_id,label' }
    )

    const results: any[] = []

    for (const config of configs) {
      try {
        const portfolio = await getT212Portfolio(config)
        const today = new Date().toISOString().split('T')[0]

        await supabaseAdmin.from('accounts').update({
          saldo_atual: portfolio.total,
          saldo_data: today,
        }).eq('id', account_id)

        results.push({
          account: config.label,
          total: portfolio.total,
          cash: portfolio.cash,
          marketValue: portfolio.marketValue,
          ppl: portfolio.ppl,
        })

        await createNotification({
          userId: user_id,
          type: 'import_success',
          title: `T212 ${config.label} sincronizado`,
          body: `Total: €${portfolio.total.toFixed(2)} · Cash: €${portfolio.cash.toFixed(2)} · Posições: €${portfolio.marketValue.toFixed(2)} · P&L: ${portfolio.ppl >= 0 ? '+' : ''}€${portfolio.ppl.toFixed(2)}`,
          meta: { account_id, ...portfolio },
        })

      } catch (err: any) {
        console.error(`T212 sync error (${config.label}):`, err.message)
        results.push({ account: config.label, error: err.message })
        await createNotification({
          userId: user_id,
          type: 'import_error',
          title: `Erro ao sincronizar T212 ${config.label}`,
          body: err.message,
          meta: { account_id },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, results })

  } catch (err: any) {
    console.error('T212 sync exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
