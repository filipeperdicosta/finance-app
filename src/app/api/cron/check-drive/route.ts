import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getSupabaseAdmin } from '@/lib/googleDrive'
import { parseStatementWithGemini, detectMimeType } from '@/lib/geminiParse'

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
                hash: `${account.id}-${t.data}-${t.descritivo.slice(0,20)}-${t.valor}-${Date.now()}-${i}`,
                import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
              }))

              if (txnsToInsert.length) {
                await supabaseAdmin.from('transactions').upsert(txnsToInsert, { onConflict: 'hash', ignoreDuplicates: true })
              }

              const { data: batch } = await supabaseAdmin.from('import_batches').insert({
                account_id: account.id, filename: file.name, source: 'google_drive', google_file_id: file.id,
                periodo_fim: result.meta.periodo_fim, total_txn: txnsToInsert.length,
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

    return NextResponse.json({ ok: true, ...summary, duration_sec: durationSec })

  } catch (err: any) {
    console.error('Cron check-drive exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
