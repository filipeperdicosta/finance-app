import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getSupabaseAdmin } from '@/lib/googleDrive'
import { parseStatementWithGemini, detectMimeType } from '@/lib/geminiParse'

// Importa um ficheiro específico da Drive: descarrega, processa com Gemini,
// guarda transações + actualiza o saldo da conta, regista em drive_files.
// POST /api/drive/import  body: { user_id, account_id, google_file_id, filename, trigger_type? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { user_id, account_id, google_file_id, filename, trigger_type } = body

    if (!user_id || !account_id || !google_file_id || !filename) {
      return NextResponse.json({ error: 'Parâmetros em falta' }, { status: 400 })
    }

    const accessToken = await getValidAccessToken(user_id)
    if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    // Descarrega o ficheiro da Drive
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

    // Processa com Gemini (lógica partilhada com o upload manual)
    const result = await parseStatementWithGemini(base64, mimeType, sizeMB)
    if (!result.ok) {
      // Regista a tentativa falhada no drive_files para não ficar "pendente" silenciosamente
      await supabaseAdmin.from('drive_files').upsert({
        account_id, google_file_id, filename, status: 'ignorado', discovered_at: new Date().toISOString(),
      }, { onConflict: 'account_id,google_file_id' })
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Hash único por transação (mesmo padrão usado no import manual)
    const txnsToInsert = result.transactions.map((t, i) => ({
      account_id, data: t.data, descritivo: t.descritivo, valor: t.valor,
      categoria: t.categoria, categoria_confirmada: false, ai_confianca: null,
      excluir_analise: false, imovel_classificado: false,
      hash: `${account_id}-${t.data}-${t.descritivo.slice(0,20)}-${t.valor}-${Date.now()}-${i}`,
      import_batch_id: null, imovel_id: null, notas: null, subcategoria: null, descritivo_norm: null,
    }))

    if (txnsToInsert.length) {
      const { error: insertError } = await supabaseAdmin.from('transactions').upsert(txnsToInsert, { onConflict: 'hash', ignoreDuplicates: true })
      if (insertError) console.error('Erro ao inserir transações:', insertError)
    }

    // Cria o import_batch para rastreio/notificações
    const { data: batch } = await supabaseAdmin.from('import_batches').insert({
      account_id, filename, source: 'google_drive', google_file_id,
      periodo_fim: result.meta.periodo_fim, total_txn: txnsToInsert.length,
      status: 'complete', trigger_type: trigger_type ?? 'on_demand',
    }).select().single()

    // Actualiza saldo/IBAN da conta, respeitando a regra de "só se mais recente"
    const { data: account } = await supabaseAdmin.from('accounts').select('*').eq('id', account_id).single()
    if (account) {
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
      if (Object.keys(updates).length) await supabaseAdmin.from('accounts').update(updates).eq('id', account_id)
    }

    // Marca o ficheiro como importado em drive_files
    await supabaseAdmin.from('drive_files').upsert({
      account_id, google_file_id, filename, status: 'importado',
      import_batch_id: batch?.id ?? null, discovered_at: new Date().toISOString(), imported_at: new Date().toISOString(),
    }, { onConflict: 'account_id,google_file_id' })

    const totalRec = result.transactions.filter(t => t.valor > 0).reduce((s, t) => s + t.valor, 0)
    const totalDesp = result.transactions.filter(t => t.valor < 0).reduce((s, t) => s + Math.abs(t.valor), 0)

    return NextResponse.json({
      ok: true,
      batch_id: batch?.id ?? null,
      transactions_count: txnsToInsert.length,
      total_receitas: totalRec,
      total_despesas: totalDesp,
    })

  } catch (err: any) {
    console.error('Drive import exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
