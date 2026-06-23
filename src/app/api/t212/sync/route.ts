import { NextRequest, NextResponse } from 'next/server'
import { getT212Configs, getT212Portfolio, getT212Transactions } from '@/lib/t212'
import { getSupabaseAdmin, createNotification } from '@/lib/googleDrive'

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

    // Se um label específico foi pedido, usa só esse; caso contrário, usa todos
    const configs = label ? allConfigs.filter(c => c.label === label) : allConfigs
    if (!configs.length) {
      return NextResponse.json({ error: `Config T212 "${label}" não encontrada` }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Guarda/actualiza a configuração persistente (conta da app ↔ label T212)
    await supabaseAdmin.from('t212_config').upsert(
      { user_id, account_id, label: configs[0].label },
      { onConflict: 'user_id,label' }
    )

    const results: any[] = []

    for (const config of configs) {
      try {
        // 1) Portfolio — usa /cash que já converte tudo para EUR
        const portfolio = await getT212Portfolio(config)
        const today = new Date().toISOString().split('T')[0]
        await supabaseAdmin.from('accounts').update({
          saldo_atual: portfolio.total,
          saldo_data: today,
        }).eq('id', account_id)

        // 2) Transacções — pode falhar com 403 se a API key não tiver permissão "History"
        let newTransactions = 0
        let txnWarning: string | null = null
        try {
          const txns = await getT212Transactions(config)
          const { data: existing } = await supabaseAdmin
            .from('transactions').select('hash').eq('account_id', account_id)
          const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))

          const toInsert = txns
            .filter((t: any) => !existingHashes.has(`t212-${config.label}-${t.reference ?? t.orderId ?? t.id}`))
            .map((t: any, i: number) => ({
              account_id,
              data: t.dateCreated ? t.dateCreated.split('T')[0] : today,
              descritivo: [t.type, t.ticker, t.reference].filter(Boolean).join(' · '),
              valor: Number(t.amount) || 0,
              categoria: Number(t.amount) > 0 ? 'Receita' : t.type === 'FEE' ? 'Comissões e Taxas' : 'Transferências',
              categoria_confirmada: false, ai_confianca: null, excluir_analise: false,
              imovel_classificado: false, ordem_extrato: i,
              hash: `t212-${config.label}-${t.reference ?? t.orderId ?? t.id ?? i}`,
              import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
            }))

          if (toInsert.length) {
            await supabaseAdmin.from('transactions').upsert(toInsert, { onConflict: 'hash', ignoreDuplicates: true })
          }
          newTransactions = toInsert.length
        } catch (txnErr: any) {
          // 403 = API key sem permissão de "History" — não é erro fatal, saldo foi actualizado
          if (txnErr.message?.includes('403')) {
            txnWarning = 'Transacções não importadas: a tua API key não tem permissão "History". Regenera a key com essa permissão activa.'
          } else {
            txnWarning = txnErr.message
          }
          console.warn(`T212 transactions warning (${config.label}):`, txnErr.message)
        }

        results.push({
          account: config.label,
          total: portfolio.total,
          cash: portfolio.cash,
          marketValue: portfolio.marketValue,
          ppl: portfolio.ppl,
          newTransactions,
          warning: txnWarning,
        })

        await createNotification({
          userId: user_id,
          type: txnWarning ? 'import_error' : 'import_success',
          title: `T212 ${config.label} sincronizado`,
          body: txnWarning ?? `Saldo: €${portfolio.total.toFixed(2)} · ${newTransactions} transaç${newTransactions !== 1 ? 'ões' : 'ão'} nova${newTransactions !== 1 ? 's' : ''}`,
          meta: { account_id, ...portfolio, new_transactions: newTransactions, warning: txnWarning },
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
