import { NextRequest, NextResponse } from 'next/server'
import { getEnableBankingBalance, getEnableBankingTransactions } from '@/lib/enableBanking'
import { getSupabaseAdmin, createNotification } from '@/lib/googleDrive'
import { categorizeSingleTransaction } from '@/lib/geminiParse'

// Sincroniza saldos e transacções de contas Enable Banking.
// POST /api/enablebanking/sync  body: { user_id }
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
    const { user_id } = body
    if (!user_id) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const today = new Date().toISOString().split('T')[0]

    // Carrega regras aprendidas
    const { data: rulesData } = await supabaseAdmin
      .from('category_rules').select('*').eq('ativa', true).order('vezes_usada', { ascending: false })
    const rules = (rulesData ?? []) as { pattern: string; categoria: string; vezes_usada: number }[]

    // Busca todas as contas Enable Banking com conta da app associada
    const { data: ebAccounts } = await supabaseAdmin
      .from('enablebanking_accounts')
      .select('*, enablebanking_sessions(bank_name, bank_country, valid_until), accounts(nome)')
      .eq('user_id', user_id)
      .not('account_id', 'is', null)

    if (!ebAccounts?.length) {
      return NextResponse.json({ ok: true, message: 'Sem contas Enable Banking configuradas', results: [] })
    }

    const results: any[] = []

    for (const ebAcc of ebAccounts) {
      const session = ebAcc.enablebanking_sessions as any
      const accountName = (ebAcc.accounts as any)?.nome ?? session?.bank_name ?? 'Conta'

      if (session?.valid_until && new Date(session.valid_until) < new Date()) {
        results.push({ accountName, bank: session.bank_name, error: 'Sessão expirada — re-autoriza o banco' })
        continue
      }

      try {
        // 1) Saldo
        const balance = await getEnableBankingBalance(ebAcc.account_uid)
        if (balance !== null) {
          await supabaseAdmin.from('accounts').update({ saldo_atual: balance, saldo_data: today }).eq('id', ebAcc.account_id)
        }

        // 2) Transacções novas com categorização
        const dateFrom = new Date(Date.now() - 90*24*60*60*1000).toISOString().split('T')[0]
        let newTxns = 0
        try {
          const txns = await getEnableBankingTransactions(ebAcc.account_uid, dateFrom)
          const { data: existing } = await supabaseAdmin
            .from('transactions').select('hash').eq('account_id', ebAcc.account_id)
          const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))

          const newTxnsList = txns.filter((t: any) => {
            const hash = `eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? ''}`
            return !existingHashes.has(hash)
          })

          if (newTxnsList.length > 0) {
            const toInsert = await Promise.all(newTxnsList.map(async (t: any, i: number) => {
              const amount = Number(t.transaction_amount?.amount) || 0
              const valor = t.credit_debit_indicator === 'DBIT' ? -Math.abs(amount) : Math.abs(amount)
              const descritivo = t.remittance_information?.unstructured?.[0]
                ?? t.creditor?.name ?? t.debtor?.name ?? 'Transação'
              const categoria = await categorizeSingleTransaction(descritivo, valor, rules)
              return {
                account_id: ebAcc.account_id,
                data: t.booking_date ?? t.value_date ?? today,
                descritivo, valor, categoria,
                categoria_confirmada: false, ai_confianca: null, excluir_analise: false,
                imovel_classificado: false, ordem_extrato: i,
                hash: `eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? i}`,
                import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
              }
            }))
            await supabaseAdmin.from('transactions').upsert(toInsert, { onConflict: 'hash', ignoreDuplicates: true })
            newTxns = toInsert.length
          }
        } catch (txnErr: any) {
          console.warn(`EB sync transactions (${accountName}):`, txnErr.message)
        }

        results.push({ accountName, bank: session?.bank_name, balance, newTxns })

      } catch (err: any) {
        console.error(`EB sync error (${accountName}):`, err.message)
        results.push({ accountName, bank: session?.bank_name, error: err.message })
      }
    }

    // Notificação com detalhe por conta
    const hasErrors = results.some(r => r.error)
    const lines = results.map(r =>
      r.error
        ? `✗ ${r.accountName}: ${r.error}`
        : `${r.accountName}: €${r.balance?.toFixed(2) ?? 'N/A'} · ${r.newTxns} nova${r.newTxns !== 1 ? 's' : ''}`
    )
    await createNotification({
      userId: user_id,
      type: hasErrors ? 'import_error' : 'import_success',
      title: `Enable Banking — ${results.length} conta${results.length !== 1 ? 's' : ''} sincronizada${results.length !== 1 ? 's' : ''}`,
      body: lines.join('\n'),
      meta: { results },
    })

    return NextResponse.json({ ok: true, results })

  } catch (err: any) {
    console.error('Enable Banking sync exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
