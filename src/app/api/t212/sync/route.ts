import { NextRequest, NextResponse } from 'next/server'
import { getT212Configs, getT212Portfolio, getT212Transactions } from '@/lib/t212'
import { getSupabaseAdmin, createNotification } from '@/lib/googleDrive'

// Sincroniza dados do Trading 212 para a base de dados:
// 1) Actualiza o saldo da conta T212 com o valor total (cash + posições de mercado)
// 2) Importa transacções em dinheiro novas (depósitos, levantamentos, dividendos)
//
// POST /api/t212/sync  body: { user_id, account_id }
// account_id = id da conta na app associada a esta conta T212
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
    const { user_id, account_id } = body
    if (!user_id || !account_id) {
      return NextResponse.json({ error: 'user_id e account_id são obrigatórios' }, { status: 400 })
    }

    const configs = getT212Configs()
    if (!configs.length) {
      return NextResponse.json({ error: 'Credenciais T212 não configuradas no servidor' }, { status: 500 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const results: any[] = []

    for (const config of configs) {
      try {
        // 1) Portfolio: cash + valor de mercado
        const portfolio = await getT212Portfolio(config)

        // Actualiza saldo da conta, só se for o valor mais recente
        const today = new Date().toISOString().split('T')[0]
        await supabaseAdmin.from('accounts').update({
          saldo_atual: portfolio.total,
          saldo_data: today,
        }).eq('id', account_id)

        // 2) Transacções em dinheiro — importa só as que ainda não estão na BD
        const txns = await getT212Transactions(config)
        const { data: existing } = await supabaseAdmin
          .from('transactions')
          .select('hash')
          .eq('account_id', account_id)

        const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))

        const toInsert = txns
          .filter(t => {
            const hash = `t212-${config.label}-${t.reference ?? t.orderId ?? t.id}`
            return !existingHashes.has(hash)
          })
          .map((t, i) => {
            // Tipos T212: DEPOSIT, WITHDRAWAL, DIVIDEND, FEE, ...
            const valor = Number(t.amount) || 0
            const categoria = valor > 0
              ? 'Receita'
              : t.type === 'FEE' ? 'Comissões e Taxas'
              : t.type === 'WITHDRAWAL' ? 'Transferências'
              : 'Transferências'
            const descritivo = [t.type, t.ticker, t.reference].filter(Boolean).join(' · ')
            const hash = `t212-${config.label}-${t.reference ?? t.orderId ?? t.id ?? i}`
            return {
              account_id,
              data: t.dateCreated ? t.dateCreated.split('T')[0] : today,
              descritivo,
              valor,
              categoria,
              categoria_confirmada: false,
              ai_confianca: null,
              excluir_analise: false,
              imovel_classificado: false,
              ordem_extrato: i,
              hash,
              import_batch_id: null,
              imovel_id: null,
              notas: null,
              subcategoria: null,
              descritivo_norm: null,
            }
          })

        if (toInsert.length) {
          await supabaseAdmin.from('transactions').upsert(toInsert, { onConflict: 'hash', ignoreDuplicates: true })
        }

        results.push({
          account: config.label,
          total: portfolio.total,
          cash: portfolio.cash,
          marketValue: portfolio.marketValue,
          ppl: portfolio.ppl,
          newTransactions: toInsert.length,
        })

        await createNotification({
          userId: user_id,
          type: 'import_success',
          title: `T212 ${config.label} sincronizado`,
          body: `Saldo: €${portfolio.total.toFixed(2)} · ${toInsert.length} transaç${toInsert.length !== 1 ? 'ões' : 'ão'} nova${toInsert.length !== 1 ? 's' : ''}`,
          meta: { account_id, ...portfolio, new_transactions: toInsert.length },
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
