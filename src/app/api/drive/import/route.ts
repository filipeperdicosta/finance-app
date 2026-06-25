import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getSupabaseAdmin, createNotification } from '@/lib/googleDrive'
import { parseStatementWithGemini, detectMimeType, txnHash } from '@/lib/geminiParse'

type ConfirmedTxn = { data: string; descritivo: string; valor: number; categoria: string }

// Grava transações de um ficheiro da Drive na base de dados.
//
// Dois modos de utilização:
//
// 1) MODO CONFIRMADO (fluxo manual — Importar → Drive → preview → confirmar):
//    body inclui "transactions" já revistas pelo utilizador no ecrã de preview.
//    Não volta a chamar o Gemini — grava exactamente o que foi confirmado.
//
// 2) MODO AUTOMÁTICO (cron diário, sem ninguém a rever):
//    body NÃO inclui "transactions" — esta rota descarrega o ficheiro, processa
//    com o Gemini, e grava tudo de uma vez, sem pausa para confirmação humana.
//
// POST /api/drive/import
//   body: { user_id, account_id, google_file_id, filename, trigger_type?, transactions?, meta? }
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
    const { user_id, account_id, google_file_id, filename, trigger_type } = body
    const confirmedTxns: ConfirmedTxn[] | undefined = body.transactions
    const confirmedMeta = body.meta

    if (!user_id || !account_id || !google_file_id || !filename) {
      return NextResponse.json({ error: 'Parâmetros em falta' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    let finalTransactions: ConfirmedTxn[]
    let finalMeta: { saldo_final: number | null; iban: string | null; numero_conta: string | null; periodo_fim: string | null }

    if (confirmedTxns) {
      // MODO CONFIRMADO: usa exactamente o que veio do preview, sem voltar a chamar o Gemini
      finalTransactions = confirmedTxns
      finalMeta = confirmedMeta ?? { saldo_final: null, iban: null, numero_conta: null, periodo_fim: null }
    } else {
      // MODO AUTOMÁTICO: descarrega + processa agora, sem pausa
      const accessToken = await getValidAccessToken(user_id)
      if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${google_file_id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!fileRes.ok) {
        const errText = await fileRes.text()
        console.error('Falha ao descarregar ficheiro da Drive:', fileRes.status, errText)
        return NextResponse.json({ error: `Erro ao descarregar ficheiro: ${fileRes.status}` }, { status: 500 })
      }
      const bytes = await fileRes.arrayBuffer()
      const sizeMB = bytes.byteLength / (1024 * 1024)
      const base64 = Buffer.from(bytes).toString('base64')
      const mimeType = detectMimeType(filename)

      const result = await parseStatementWithGemini(base64, mimeType, sizeMB)
      if (!result.ok) {
        await supabaseAdmin.from('drive_files').upsert({
          account_id, google_file_id, filename, status: 'ignorado', discovered_at: new Date().toISOString(),
        }, { onConflict: 'account_id,google_file_id' })
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      finalTransactions = result.transactions
      finalMeta = result.meta
    }

    // Hash determinístico — permite deduplicar com transacções já importadas via Enable Banking
    const txnsToInsert = finalTransactions.map((t, i) => ({
      account_id, data: t.data, descritivo: t.descritivo, valor: t.valor,
      categoria: t.categoria, categoria_confirmada: false, ai_confianca: null,
      excluir_analise: false, imovel_classificado: false, ordem_extrato: i,
      hash: txnHash(account_id, t.data, t.valor, t.descritivo),
      import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
    }))

    // Filtra as que já existem na BD (por hash) antes de inserir
    const { data: existing } = await supabaseAdmin.from('transactions').select('hash').eq('account_id', account_id)
    const existingHashes = new Set((existing ?? []).map((t: any) => t.hash))
    const newTxns = txnsToInsert.filter(t => !existingHashes.has(t.hash))

    if (newTxns.length) {
      const { error: insertError } = await supabaseAdmin.from('transactions').upsert(newTxns, { onConflict: 'hash', ignoreDuplicates: true })
      if (insertError) console.error('Erro ao inserir transações:', insertError)
    }

    // Cria o import_batch para rastreio/notificações
    const { data: batch } = await supabaseAdmin.from('import_batches').insert({
      account_id, filename, source: 'google_drive', google_file_id,
      periodo_fim: finalMeta.periodo_fim, total_txn: newTxns.length,
      status: 'complete', trigger_type: trigger_type ?? (confirmedTxns ? 'manual' : 'cron'),
    }).select().single()

    // Actualiza saldo/IBAN da conta, respeitando a regra de "só se mais recente"
    const { data: account } = await supabaseAdmin.from('accounts').select('*').eq('id', account_id).single()
    if (account) {
      const updates: any = {}
      const novaData = finalMeta.periodo_fim
      const dataActual = account.saldo_data
      const ehMaisRecente = !dataActual || (novaData && novaData > dataActual)
      if (finalMeta.saldo_final !== null && ehMaisRecente) {
        updates.saldo_atual = finalMeta.saldo_final
        updates.saldo_data = novaData
      }
      if (finalMeta.iban && !account.iban) updates.iban = finalMeta.iban
      if (finalMeta.numero_conta && !account.numero_conta) updates.numero_conta = finalMeta.numero_conta
      if (Object.keys(updates).length) await supabaseAdmin.from('accounts').update(updates).eq('id', account_id)
    }

    // Marca o ficheiro como importado em drive_files
    await supabaseAdmin.from('drive_files').upsert({
      account_id, google_file_id, filename, status: 'importado',
      import_batch_id: batch?.id ?? null, discovered_at: new Date().toISOString(), imported_at: new Date().toISOString(),
    }, { onConflict: 'account_id,google_file_id' })

    const totalRec = finalTransactions.filter(t => t.valor > 0).reduce((s, t) => s + t.valor, 0)
    const totalDesp = finalTransactions.filter(t => t.valor < 0).reduce((s, t) => s + Math.abs(t.valor), 0)
    const isManual = !!confirmedTxns

    // Regista notificação persistente
    await createNotification({
      userId: user_id,
      type: isManual ? 'manual_import' : 'import_success',
      title: isManual ? `Import manual — ${filename}` : `Import automático — ${filename}`,
      body: `${newTxns.length} transações importadas (${txnsToInsert.length - newTxns.length} já existiam)`,
      meta: { account_id, filename, txn_count: newTxns.length, total_parsed: txnsToInsert.length, total_rec: totalRec, total_desp: totalDesp, batch_id: batch?.id ?? null },
    })

    return NextResponse.json({
      ok: true,
      batch_id: batch?.id ?? null,
      transactions_count: newTxns.length, total_parsed: txnsToInsert.length,
      total_receitas: totalRec,
      total_despesas: totalDesp,
    })

  } catch (err: any) {
    console.error('Drive import exception:', err)
    // Notificação de erro (best-effort — não falha se não tiver user_id)
    if (body?.user_id) {
      await createNotification({ userId: body.user_id, type: 'import_error', title: `Erro ao importar — ${body?.filename ?? 'ficheiro'}`, body: err.message, meta: { filename: body?.filename } }).catch(()=>{})
    }
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
