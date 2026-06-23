import { NextRequest, NextResponse } from 'next/server'
import { getEnableBankingBalance, getEnableBankingTransactions } from '@/lib/enableBanking'
import { getSupabaseAdmin, createNotification } from '@/lib/googleDrive'

// Sincroniza saldos e transacções de contas Enable Banking para a app.
// POST /api/enablebanking/sync  body: { user_id }
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
    const { user_id } = body
    if (!user_id) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    // Busca todas as contas Enable Banking associadas a este utilizador
    const { data: ebAccounts } = await supabaseAdmin
      .from('enablebanking_accounts')
      .select('*, enablebanking_sessions(bank_name, bank_country, valid_until)')
      .eq('user_id', user_id)
      .not('account_id', 'is', null) // só as que têm conta da app associada

    if (!ebAccounts?.length) {
      return NextResponse.json({ ok: true, message: 'Sem contas Enable Banking configuradas', synced: 0 })
    }

    const today = new Date().toISOString().split('T')[0]
    const results: any[] = []

    for (const ebAcc of ebAccounts) {
      const session = ebAcc.enablebanking_sessions as any
      // Verifica se a sessão ainda é válida
      if (session?.valid_until && new Date(session.valid_until) < new Date()) {
        results.push({ account_uid: ebAcc.account_uid, error: 'Sessão expirada — re-autoriza o banco' })
        continue
      }

      try {
        // 1) Saldo
        const balance = await getEnableBankingBalance(ebAcc.account_uid)
        if (balance !== null) {
          await supabaseAdmin.from('accounts').update({
            saldo_atual: balance,
            saldo_data: today,
          }).eq('id', ebAcc.account_id)
        }

        // 2) Transacções — busca apenas as dos últimos 90 dias para não exceder rate limits
        const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        let newTxns = 0
        try {
          const txns = await getEnableBankingTransactions(ebAcc.account_uid, dateFrom)
          const { data: existing } = await supabaseAdmin
            .from('transactions').select('hash').eq('account_id', ebAcc.account_id)
          const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))

          const toInsert = txns
            .filter((t: any) => {
              const hash = `eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? JSON.stringify(t.transaction_amount)}`
              return !existingHashes.has(hash)
            })
            .map((t: any, i: number) => {
              const amount = Number(t.transaction_amount?.amount) || 0
              const valor = t.credit_debit_indicator === 'DBIT' ? -Math.abs(amount) : Math.abs(amount)
              const descritivo = t.remittance_information?.unstructured?.[0]
                ?? t.creditor?.name
                ?? t.debtor?.name
                ?? t.additional_information
                ?? 'Transação Revolut'
              return {
                account_id: ebAcc.account_id,
                data: t.booking_date ?? t.value_date ?? today,
                descritivo,
                valor,
                categoria: valor >= 0 ? 'Receita' : 'Transferências',
                categoria_confirmada: false,
                ai_confianca: null,
                excluir_analise: false,
                imovel_classificado: false,
                ordem_extrato: i,
                hash: `eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? i}`,
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
          newTxns = toInsert.length
        } catch (txnErr: any) {
          console.warn(`Enable Banking transactions (${ebAcc.account_uid}): ${txnErr.message}`)
        }

        results.push({ account_uid: ebAcc.account_uid, balance, new_transactions: newTxns })

      } catch (err: any) {
        console.error(`Enable Banking sync error (${ebAcc.account_uid}):`, err.message)
        results.push({ account_uid: ebAcc.account_uid, error: err.message })
      }
    }

    const hasErrors = results.some(r => r.error)
    await createNotification({
      userId: user_id,
      type: hasErrors ? 'import_error' : 'import_success',
      title: `Enable Banking sincronizado`,
      body: results.map(r => r.error ? `✗ ${r.error}` : `✓ Saldo: €${r.balance?.toFixed(2)} · ${r.new_transactions} novas`).join(' · '),
      meta: { results },
    })

    return NextResponse.json({ ok: true, results })

  } catch (err: any) {
    console.error('Enable Banking sync exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
