import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getSupabaseAdmin, createNotification } from '@/lib/googleDrive'
import { parseStatementWithGemini, detectMimeType, categorizeSingleTransaction, txnHash } from '@/lib/geminiParse'
import { getT212Configs, getT212Portfolio } from '@/lib/t212'
import { getEnableBankingBalance, getEnableBankingTransactions, getMccCategory, getKeywordCategory } from '@/lib/enableBanking'

// Verificação automática diária: para CADA utilizador com Drive ligada,
// percorre as suas contas com pasta associada, identifica ficheiros novos
// (não vistos em drive_files) e importa-os automaticamente.
// Disparado pelo Vercel Cron (ver vercel.json) — protegido por CRON_SECRET.
export async function GET(req: NextRequest) {
  // Protecção: só o Vercel Cron (que envia este header) pode chamar esta rota
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const startedAt = Date.now()
  const summary = {
    users_checked: 0,
    accounts_checked: 0,
    files_found: 0,
    files_imported: 0,
    files_failed: 0,
    errors: [] as string[],
  }

  try {
    // 1) Todos os utilizadores com Drive ligada
    const { data: tokens, error: tokensError } = await supabaseAdmin
      .from('google_drive_tokens')
      .select('user_id')

    if (tokensError) {
      console.error('Cron: erro ao listar tokens:', tokensError)
      return NextResponse.json({ error: tokensError.message }, { status: 500 })
    }

    for (const tokenRow of tokens ?? []) {
      const userId = tokenRow.user_id
      summary.users_checked++

      // 2) Contas desse utilizador com pasta Drive associada
      const { data: accounts } = await supabaseAdmin
        .from('accounts')
        .select('*')
        .not('drive_folder_id', 'is', null)

      if (!accounts?.length) continue

      const accessToken = await getValidAccessToken(userId)
      if (!accessToken) {
        summary.errors.push(`user ${userId}: token inválido/expirado`)
        continue
      }

      for (const account of accounts) {
        summary.accounts_checked++

        try {
          // Lista ficheiros da pasta (com paginação, igual à rota /api/drive/files)
          const mimeFilter = [
            "mimeType = 'application/pdf'",
            "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
            "mimeType = 'application/vnd.ms-excel'",
            "mimeType = 'text/csv'",
          ].join(' or ')
          const q = encodeURIComponent(`'${account.drive_folder_id}' in parents and (${mimeFilter}) and trashed = false`)
          const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime)')

          let allFiles: any[] = []
          let pageToken: string | undefined = undefined
          do {
            const pageParam = pageToken ? `&pageToken=${pageToken}` : ''
            const listRes: Response = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name desc&pageSize=1000${pageParam}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (!listRes.ok) {
              summary.errors.push(`conta ${account.nome}: erro ao listar Drive (${listRes.status})`)
              break
            }
            const listData: any = await listRes.json()
            allFiles = allFiles.concat(listData.files ?? [])
            pageToken = listData.nextPageToken
          } while (pageToken)

          summary.files_found += allFiles.length

          // 3) Quais já foram vistos (drive_files)
          const { data: knownFiles } = await supabaseAdmin
            .from('drive_files')
            .select('google_file_id')
            .eq('account_id', account.id)

          const knownIds = new Set((knownFiles ?? []).map((f: any) => f.google_file_id))
          const newFiles = allFiles.filter(f => !knownIds.has(f.id))

          // 4) Processa cada ficheiro novo
          for (const file of newFiles) {
            try {
              const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              if (!fileRes.ok) {
                summary.files_failed++
                summary.errors.push(`ficheiro ${file.name} (${account.nome}): download falhou — HTTP ${fileRes.status}`)
                await supabaseAdmin.from('drive_files').upsert({
                  account_id: account.id, google_file_id: file.id, filename: file.name,
                  status: 'ignorado', discovered_at: new Date().toISOString(),
                }, { onConflict: 'account_id,google_file_id' })
                continue
              }

              const bytes = await fileRes.arrayBuffer()
              const sizeMB = bytes.byteLength / (1024 * 1024)
              const base64 = Buffer.from(bytes).toString('base64')
              const mimeType = detectMimeType(file.name)

              const result = await parseStatementWithGemini(base64, mimeType, sizeMB)

              if (!result.ok) {
                summary.files_failed++
                summary.errors.push(`ficheiro ${file.name} (${account.nome}): parsing falhou — ${result.error ?? 'motivo desconhecido'}`)
                await supabaseAdmin.from('drive_files').upsert({
                  account_id: account.id, google_file_id: file.id, filename: file.name,
                  status: 'ignorado', discovered_at: new Date().toISOString(),
                }, { onConflict: 'account_id,google_file_id' })
                continue
              }

              const txnsToInsert = result.transactions.map((t: { data: string; descritivo: string; valor: number; categoria: string }, i: number) => ({
                account_id: account.id, data: t.data, descritivo: t.descritivo, valor: t.valor,
                categoria: t.categoria, categoria_confirmada: false, ai_confianca: null,
                excluir_analise: false, imovel_classificado: false, ordem_extrato: i,
                hash: txnHash(account.id, t.data, t.valor, t.descritivo),
                import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
              }))

              // Filtra as que já existem (pode ter chegado via Enable Banking)
              const { data: existing } = await supabaseAdmin.from('transactions').select('hash, data, valor').eq('account_id', account.id)
              const existingHashSet = new Set((existing ?? []).map((t: any) => t.hash))
              const existingValSet  = new Set((existing ?? []).map((t: any) => `${t.data}|${t.valor}`))
              const newTxns = txnsToInsert
                .filter((t: any) => !existingHashSet.has(t.hash))
                .map((t: any) => ({
                  ...t,
                  suspeita_duplicado: existingValSet.has(`${t.data}|${t.valor}`),
                }))

              if (newTxns.length) {
                await supabaseAdmin.from('transactions').upsert(newTxns, { onConflict: 'hash', ignoreDuplicates: true })
              }

              const { data: batch } = await supabaseAdmin.from('import_batches').insert({
                account_id: account.id, filename: file.name, source: 'google_drive', google_file_id: file.id,
                periodo_fim: result.meta.periodo_fim, total_txn: newTxns.length,
                status: 'complete', trigger_type: 'cron',
              }).select().single()

              // Actualiza saldo/IBAN, só se mais recente
              const updates: any = {}
              const novaData = result.meta.periodo_fim
              const dataActual = account.saldo_data
              const ehMaisRecente = !dataActual || (novaData && novaData > dataActual)
              if (result.meta.saldo_final !== null && ehMaisRecente) {
                updates.saldo_atual = result.meta.saldo_final
                updates.saldo_data = novaData
              }
              if (result.meta.iban && !account.iban) updates.iban = result.meta.iban
              if (result.meta.numero_conta && !account.numero_conta) updates.numero_conta = result.meta.numero_conta
              if (Object.keys(updates).length) {
                await supabaseAdmin.from('accounts').update(updates).eq('id', account.id)
              }

              await supabaseAdmin.from('drive_files').upsert({
                account_id: account.id, google_file_id: file.id, filename: file.name, status: 'importado',
                import_batch_id: batch?.id ?? null, discovered_at: new Date().toISOString(), imported_at: new Date().toISOString(),
              }, { onConflict: 'account_id,google_file_id' })

              summary.files_imported++

            } catch (fileErr: any) {
              summary.files_failed++
              summary.errors.push(`ficheiro ${file.name}: ${fileErr.message}`)
            }
          }

        } catch (accErr: any) {
          summary.errors.push(`conta ${account.nome}: ${accErr.message}`)
        }
      }
    }

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log('Cron check-drive concluído:', JSON.stringify({ ...summary, duration_sec: durationSec }))

    // Cria uma notificação de resumo por utilizador
    for (const tokenRow of tokens ?? []) {
      const hasErrors = summary.errors.length > 0
      const type = hasErrors ? 'import_error' : 'cron_summary'
      const title = summary.files_imported > 0
        ? `Verificação automática — ${summary.files_imported} ficheiro${summary.files_imported !== 1 ? 's' : ''} importado${summary.files_imported !== 1 ? 's' : ''}`
        : hasErrors ? 'Verificação automática — erros encontrados' : 'Verificação automática — sem novidades'
      const body = [
        `${summary.accounts_checked} conta${summary.accounts_checked !== 1 ? 's' : ''} verificada${summary.accounts_checked !== 1 ? 's' : ''}`,
        summary.files_imported > 0 ? `${summary.files_imported} importado${summary.files_imported !== 1 ? 's' : ''}` : null,
        summary.files_failed > 0 ? `${summary.files_failed} com erro` : null,
      ].filter(Boolean).join(' · ')

      await createNotification({
        userId: tokenRow.user_id,
        type,
        title,
        body,
        meta: { ...summary, duration_sec: durationSec },
      })
    }

    // ── T212: actualiza saldo do portfolio ──
    const t212Configs = getT212Configs()
    if (t212Configs.length > 0) {
      const supabaseT212 = getSupabaseAdmin()
      const { data: t212SavedConfigs } = await supabaseT212.from('t212_config').select('*')
      for (const saved of t212SavedConfigs ?? []) {
        const apiConfig = t212Configs.find((c: any) => c.label === saved.label)
        if (!apiConfig) continue
        try {
          const portfolio = await getT212Portfolio(apiConfig)
          const today = new Date().toISOString().split('T')[0]
          await supabaseT212.from('accounts').update({ saldo_atual: portfolio.total, saldo_data: today }).eq('id', saved.account_id)
          await createNotification({
            userId: saved.user_id,
            type: 'cron_summary',
            title: `T212 ${saved.label} actualizado`,
            body: `Total: €${portfolio.total.toFixed(2)} · Cash: €${portfolio.cash.toFixed(2)} · Posições: €${portfolio.marketValue.toFixed(2)} · P&L: ${portfolio.ppl >= 0 ? '+' : ''}€${portfolio.ppl.toFixed(2)}`,
            meta: { ...portfolio, account_id: saved.account_id },
          })
          console.log(`T212 cron: ${saved.label} → €${portfolio.total.toFixed(2)}`)
        } catch (err: any) {
          console.error(`T212 cron error (${saved.label}):`, err.message)
          await createNotification({
            userId: saved.user_id,
            type: 'import_error',
            title: `Erro T212 ${saved.label}`,
            body: err.message,
            meta: { account_id: saved.account_id },
          }).catch(() => {})
        }
      }
    }

    // ── Enable Banking: actualiza saldos e importa transacções com categorização ──
    const supabaseEB = getSupabaseAdmin()
    const { data: ebAccounts } = await supabaseEB
      .from('enablebanking_accounts')
      .select('*, enablebanking_sessions(bank_name, valid_until, user_id), accounts(nome)')
      .not('account_id', 'is', null)

    if ((ebAccounts ?? []).length > 0) {
      // getEnableBankingBalance and getEnableBankingTransactions imported statically at top
      const today = new Date().toISOString().split('T')[0]

      // Carrega regras aprendidas uma vez para todas as contas
      const { data: rulesData } = await supabaseEB.from('category_rules').select('*').eq('ativa', true).order('vezes_usada', { ascending: false })
      const rules = (rulesData ?? []) as { pattern: string; categoria: string; vezes_usada: number }[]

      // Agrupa por utilizador para notificação única no fim
      const ebResultsByUser: Record<string, { bankName: string; accountName: string; balance: number | null; newTxns: number; error?: string }[]> = {}

      for (const ebAcc of ebAccounts ?? []) {
        const session = ebAcc.enablebanking_sessions as any
        if (!session || new Date(session.valid_until) < new Date()) continue
        const userId = session.user_id
        const accountName = (ebAcc.accounts as any)?.nome ?? session.bank_name
        if (!ebResultsByUser[userId]) ebResultsByUser[userId] = []

        try {
          // 1) Saldo actualizado
          const balance = await getEnableBankingBalance(ebAcc.account_uid)
          if (balance !== null) {
            await supabaseEB.from('accounts').update({ saldo_atual: balance, saldo_data: today }).eq('id', ebAcc.account_id)
          }

          // 90 dias se conta vazia, 14 dias se já tem dados
          const { count: ebCount } = await supabaseEB.from('transactions').select('*', { count: 'exact', head: true }).eq('account_id', ebAcc.account_id)
          const ebDays = (ebCount ?? 0) > 0 ? 14 : 90
          const dateFrom = new Date(Date.now() - ebDays*24*60*60*1000).toISOString().split('T')[0]

          let newTxns = 0
          try {
            const txns = await getEnableBankingTransactions(ebAcc.account_uid, dateFrom)
            const { data: existing } = await supabaseEB.from('transactions').select('hash, data, valor, descritivo').eq('account_id', ebAcc.account_id)
            const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))
            const normDesc = (s: string) => (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
            const existingValSet = new Set((existing ?? []).map((t: any) => `${t.data}|${t.valor}`))
            const existingFullSet = new Set((existing ?? []).map((t: any) => `${t.data}|${t.valor}|${normDesc(t.descritivo)}`))
            const newTxnsList = txns.filter((t: any) => !existingHashes.has(`eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? ''}`))

            if (newTxnsList.length > 0) {
              const toInsertRaw = await Promise.all(newTxnsList.map(async (t: any, i: number) => {
                const amount = Number(t.transaction_amount?.amount) || 0
                const valor = t.credit_debit_indicator === 'DBIT' ? -Math.abs(amount) : Math.abs(amount)
                const descritivo = t.remittance_information?.[0]
                  ?? t.creditor?.name ?? t.debtor?.name
                  ?? t.bank_transaction_code?.description
                  ?? t.additional_information
                  ?? t.creditor_account?.iban ?? t.debtor_account?.iban
                  ?? 'Transação'
                const txnData = t.booking_date ?? t.value_date ?? today
                // Se já existe transacção idêntica (mesma conta+data+valor+descritivo),
                // é um re-fetch com entry_reference instável do banco — ignora silenciosamente,
                // não insere nova linha nem marca como suspeita.
                if (existingFullSet.has(`${txnData}|${valor}|${normDesc(descritivo)}`)) return null
                // Categorização: MCC → keyword → regras aprendidas → Gemini
                let categoria: string
                if (valor >= 0) {
                  categoria = 'Receita'
                } else {
                  const mccCat = getMccCategory(t.merchant_category_code)
                  const kwCat = mccCat ? null : getKeywordCategory(descritivo, valor)
                  if (mccCat) categoria = mccCat
                  else if (kwCat) categoria = kwCat
                  else categoria = await categorizeSingleTransaction(descritivo, valor, rules)
                }
                return {
                  account_id: ebAcc.account_id,
                  data: txnData,
                  descritivo, valor, categoria,
                  categoria_confirmada: false, ai_confianca: null, excluir_analise: false,
                  imovel_classificado: false, ordem_extrato: i,
                  hash: `eb-${ebAcc.account_uid}-${t.entry_reference ?? t.transaction_id ?? i}`,
                  import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
                  suspeita_duplicado: existingValSet.has(`${txnData}|${valor}`),
                }
              }))
              const toInsert = toInsertRaw.filter((t): t is NonNullable<typeof t> => t !== null)
              if (toInsert.length > 0) {
                await supabaseEB.from('transactions').upsert(toInsert, { onConflict: 'hash', ignoreDuplicates: true })
              }
              newTxns = toInsert.length
            }
          } catch (txnErr: any) {
            console.warn(`EB cron transactions (${session.bank_name}/${accountName}):`, txnErr.message)
          }

          ebResultsByUser[userId].push({ bankName: session.bank_name, accountName, balance, newTxns })
          console.log(`EB cron: ${accountName} → €${balance?.toFixed(2) ?? 'N/A'}, ${newTxns} txns novas`)

        } catch (err: any) {
          console.error(`EB cron error (${session.bank_name}/${accountName}):`, err.message)
          ebResultsByUser[userId].push({ bankName: session.bank_name, accountName, balance: null, newTxns: 0, error: err.message })
        }
      }

      // Uma notificação por utilizador com detalhe por conta
      for (const [userId, results] of Object.entries(ebResultsByUser)) {
        const hasErrors = results.some(r => r.error)
        const lines = results.map(r =>
          r.error
            ? `✗ ${r.accountName}: ${r.error}`
            : `${r.accountName}: €${r.balance?.toFixed(2) ?? 'N/A'} · ${r.newTxns} nova${r.newTxns !== 1 ? 's' : ''}`
        )
        await createNotification({
          userId,
          type: hasErrors ? 'import_error' : 'cron_summary',
          title: `Enable Banking — ${results.length} conta${results.length !== 1 ? 's' : ''} actualizada${results.length !== 1 ? 's' : ''}`,
          body: lines.join(' | '),
          meta: { results },
        })
      }
    }

    return NextResponse.json({ ok: true, ...summary, duration_sec: durationSec })

  } catch (err: any) {
    console.error('Cron check-drive exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
