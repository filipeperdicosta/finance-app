import { NextRequest, NextResponse } from 'next/server'

const GEMINI_MODEL = 'gemini-2.5-flash'

const PROMPT = `You are a financial data extraction specialist for Portuguese bank statements.

Return ONLY a valid JSON object with exactly 2 keys: "transactions" and "meta".
No markdown, no explanation — only the JSON object.

Format:
{
  "transactions": [
    { "data": "YYYY-MM-DD", "descritivo": "original description", "valor": -45.80 }
  ],
  "meta": {
    "saldo_final": 835.57,
    "iban": "PT50 0010 0000 0000 0000 0000 0",
    "numero_conta": "12345678",
    "periodo_fim": "2026-01-31"
  }
}

TRANSACTION rules:
1. "valor" is a NUMBER: NEGATIVE for debits/expenses/saídas/débitos, POSITIVE for credits/income/entradas/créditos
2. Convert dates to YYYY-MM-DD (DD/MM/YYYY → YYYY-MM-DD)
3. "descritivo" = original description text from PDF, unchanged
4. Remove € symbols and thousands separators; use period (.) as decimal separator
5. SKIP: balance rows, totals, opening/closing balance lines, headers
6. Include EVERY individual transaction, even if there are 50+

META rules:
1. "saldo_final": the closing/final account balance at the END of the statement (number, NOT string)
2. "iban": full IBAN (e.g. PT50 0010...) or null if not found
3. "numero_conta": account number digits or null if not found
4. "periodo_fim": last date of statement period as YYYY-MM-DD, or null
5. Use null for any field not present in the document

If the document is unreadable, scanned as a low-quality image, or has no transactions, still return valid JSON with "transactions": [] and meta fields as null — never return an explanation instead of JSON.`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Ficheiro não recebido' }, { status: 400 })

    const name = file.name.toLowerCase()
    let mimeType = 'application/pdf'
    if (name.endsWith('.xlsx') || name.endsWith('.xls'))
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (name.endsWith('.csv')) mimeType = 'text/csv'

    const bytes = await file.arrayBuffer()
    const sizeMB = bytes.byteLength / (1024 * 1024)
    const base64 = Buffer.from(bytes).toString('base64')

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: PROMPT }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384 }
        })
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini HTTP error:', geminiRes.status, errText)
      if (geminiRes.status === 429) return NextResponse.json({ error: 'Limite da API atingido. Aguarda alguns segundos e tenta de novo.' }, { status: 429 })
      if (geminiRes.status === 413 || sizeMB > 18) return NextResponse.json({ error: `Ficheiro demasiado grande (${sizeMB.toFixed(1)}MB). Tenta dividir o PDF em partes mais pequenas.` }, { status: 413 })
      return NextResponse.json({ error: `Erro Gemini: ${geminiRes.status}. ${errText.slice(0,200)}` }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const candidate = geminiData?.candidates?.[0]
    const finishReason = candidate?.finishReason

    // Se o modelo foi cortado (excedeu tokens) ou bloqueado por segurança, o texto fica incompleto/vazio
    if (finishReason && finishReason !== 'STOP') {
      console.error('Gemini finishReason não-STOP:', finishReason, JSON.stringify(geminiData).slice(0,500))
      if (finishReason === 'MAX_TOKENS') {
        return NextResponse.json({ error: 'O extrato é demasiado extenso para ser processado de uma vez (limite de output excedido). Tenta dividir o PDF em partes mais pequenas (ex: por trimestre).' }, { status: 422 })
      }
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json({ error: 'O Gemini bloqueou este ficheiro por filtros de conteúdo. Tenta novamente ou usa outro formato (Excel/CSV).' }, { status: 422 })
      }
      return NextResponse.json({ error: `Processamento interrompido (${finishReason}). Tenta novamente.` }, { status: 422 })
    }

    const rawText: string = candidate?.content?.parts?.[0]?.text ?? ''
    if (!rawText.trim()) {
      console.error('Gemini devolveu texto vazio. Resposta completa:', JSON.stringify(geminiData).slice(0,800))
      return NextResponse.json({ error: 'O Gemini não devolveu conteúdo para este ficheiro. Pode ser um PDF digitalizado (imagem) sem texto legível, ou estar protegido/corrompido.' }, { status: 422 })
    }

    const clean = rawText.replace(/```(?:json)?[\r\n]*/g, '').replace(/```/g, '').trim()

    let transactions: { data: string; descritivo: string; valor: number }[] = []
    let meta: { saldo_final: number | null; iban: string | null; numero_conta: string | null; periodo_fim: string | null } =
      { saldo_final: null, iban: null, numero_conta: null, periodo_fim: null }
    let parseFailed = false

    try {
      const parsed = JSON.parse(clean)
      if (Array.isArray(parsed)) {
        transactions = parsed
      } else {
        transactions = Array.isArray(parsed.transactions) ? parsed.transactions : []
        if (parsed.meta) {
          meta = {
            saldo_final: parsed.meta.saldo_final != null ? Number(parsed.meta.saldo_final) : null,
            iban: parsed.meta.iban ?? null,
            numero_conta: parsed.meta.numero_conta ?? null,
            periodo_fim: parsed.meta.periodo_fim ?? null,
          }
        }
      }
    } catch {
      const match = clean.match(/\[[\s\S]*\]/)
      if (match) {
        try { transactions = JSON.parse(match[0]) } catch { parseFailed = true }
      } else {
        parseFailed = true
      }
    }

    if (parseFailed) {
      console.error('JSON malformado do Gemini. Texto cru:', clean.slice(0,800))
      return NextResponse.json({ error: 'A resposta do Gemini não veio em formato válido. Tenta novamente — por vezes ajuda repetir o pedido.' }, { status: 422 })
    }

    transactions = transactions
      .map(t => ({
        data: String(t.data ?? '').trim(),
        descritivo: String(t.descritivo ?? '').trim(),
        valor: Number(t.valor) || 0,
      }))
      .filter(t => t.data && t.descritivo && t.valor !== 0)

    return NextResponse.json({ transactions, meta, count: transactions.length })

  } catch (err: any) {
    console.error('Parse route exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno inesperado' }, { status: 500 })
  }
}
