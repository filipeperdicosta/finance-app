import { NextRequest, NextResponse } from 'next/server'

const GEMINI_MODEL = 'gemini-2.5-flash-lite'

const CATEGORIES = ['Receita','Groceries','Restauração','Compras','Saúde','Transportes','Lazer','Levantamentos','Habitação','Utilities','Subscrições','Investimentos','Comissões e Taxas','Transferências','Despesas Gerais']

const PROMPT = `You are a financial data extraction specialist for Portuguese bank statements.

TASK: Read the attached bank statement, extract every transaction, and classify each one into a category.

OUTPUT FORMAT (mandatory): Return ONLY a valid JSON object. No markdown, no code fences, no explanation text before or after — just the raw JSON object starting with { and ending with }.

{
  "transactions": [
    { "data": "YYYY-MM-DD", "descritivo": "original description", "valor": -45.80, "categoria": "Groceries" }
  ],
  "meta": {
    "saldo_final": 835.57,
    "iban": "PT50 0010 0000 0000 0000 0000 0",
    "numero_conta": "12345678",
    "periodo_fim": "2026-01-31"
  }
}

TRANSACTION RULES (apply to every single row in the statement):
1. "valor" is always a plain NUMBER, never a string. NEGATIVE for debits/expenses/saídas/débitos. POSITIVE for credits/income/entradas/créditos.
2. Dates: always output YYYY-MM-DD. If the source uses DD/MM/YYYY or DD-MM-YYYY, convert it.
3. "descritivo": copy the original description text exactly as written in the document.
4. Strip € symbols and thousands separators (spaces, dots, commas used as thousands marks) from numbers. Use a period (.) only as the decimal separator.
5. Do NOT include: balance carried forward rows, totals, subtotals, opening/closing balance lines, or column headers.
6. Extract EVERY individual transaction row — if there are 30, 50, or 100+ rows, include all of them. Do not summarize, truncate, or skip rows to save space.

CATEGORY RULES:
1. "categoria" must be exactly one of this list (copy the exact spelling): ${CATEGORIES.join(', ')}
2. Choose based on the merchant/description. Examples: supermarket chains and grocery stores → "Groceries"; restaurants, cafés, bars → "Restauração"; fuel, tolls, public transport, ride-hailing → "Transportes"; pharmacy, clinics, hospitals → "Saúde"; ATM withdrawals → "Levantamentos"; mortgage/rent payments → "Habitação"; electricity/water/gas/internet/phone bills → "Utilities"; streaming/software/memberships → "Subscrições"; brokerage/stock purchases → "Investimentos"; bank fees/charges → "Comissões e Taxas"; transfers between own accounts or to other people → "Transferências"; salary/income/positive amounts → "Receita".
3. If genuinely unsure, use "Despesas Gerais" as a safe default — never invent a category outside the list.

META RULES:
1. "saldo_final": the closing/final account balance shown at the end of the statement period, as a plain number.
2. "iban": the full IBAN if printed on the document (format like PT50...), otherwise null.
3. "numero_conta": the account number digits if printed, otherwise null.
4. "periodo_fim": the last date covered by this statement, as YYYY-MM-DD, otherwise null.
5. Use null (not empty string, not 0) for any meta field that is not present in the document.

EDGE CASES:
- If the document is a low-quality scan or has no readable transactions, still return valid JSON: {"transactions": [], "meta": {"saldo_final": null, "iban": null, "numero_conta": null, "periodo_fim": null}}
- Never reply with an explanation instead of JSON, even if you are uncertain.
- Never wrap the JSON in markdown code fences (no \`\`\`json).`

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

    let transactions: { data: string; descritivo: string; valor: number; categoria?: string }[] = []
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

    // Diagnóstico: regista as categorias cruas devolvidas pelo Gemini (antes de validar)
    const rawCats = transactions.slice(0, 5).map(t => t.categoria)
    console.log('Categorias cruas do Gemini (amostra):', JSON.stringify(rawCats))

    // Matching tolerante a maiúsculas/espaços (o Gemini por vezes devolve "groceries" em vez de "Groceries")
    const normalizeCat = (s: string) => s?.trim().toLowerCase()
    const catLookup = new Map(CATEGORIES.map(c => [normalizeCat(c), c]))

    transactions = transactions
      .map(t => {
        const matched = t.categoria ? catLookup.get(normalizeCat(t.categoria)) : undefined
        return {
          data: String(t.data ?? '').trim(),
          descritivo: String(t.descritivo ?? '').trim(),
          valor: Number(t.valor) || 0,
          categoria: matched ?? (Number(t.valor) >= 0 ? 'Receita' : 'Despesas Gerais'),
        }
      })
      .filter(t => t.data && t.descritivo && t.valor !== 0)

    return NextResponse.json({ transactions, meta, count: transactions.length })

  } catch (err: any) {
    console.error('Parse route exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno inesperado' }, { status: 500 })
  }
}
