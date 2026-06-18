import { NextRequest, NextResponse } from 'next/server'

// Modelo actual (2.5-flash — gemini-1.5 foi descontinuado em 2026)
const GEMINI_MODEL = 'gemini-2.5-flash'

const PROMPT = `You are a financial data extraction specialist.
Extract ALL individual transactions from this bank statement PDF.

Return ONLY a valid JSON array — no markdown, no explanation, just the array.

Each transaction must have exactly these 3 fields:
[
  { "data": "YYYY-MM-DD", "descritivo": "original description", "valor": -45.80 }
]

Critical rules:
1. "valor" is always a NUMBER: NEGATIVE for debits/expenses, POSITIVE for credits/income
2. "data" must be YYYY-MM-DD (convert DD/MM/YYYY or DD-MM-YYYY)
3. "descritivo" = the original description text from the PDF
4. Remove currency symbols and thousands separators from amounts
5. Use period (.) as decimal separator in the number
6. SKIP: balance rows, totals, opening/closing balance, header rows
7. Include EVERY individual transaction

If no transactions found, return: []`

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada' }, { status: 500 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Ficheiro não recebido' }, { status: 400 })
    }

    const name = file.name.toLowerCase()
    let mimeType = 'application/pdf'
    if (name.endsWith('.xlsx') || name.endsWith('.xls'))
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else if (name.endsWith('.csv')) mimeType = 'text/csv'

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: PROMPT }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini error:', geminiRes.status, errText)
      if (geminiRes.status === 400) return NextResponse.json({ error: 'API key inválida ou ficheiro não suportado' }, { status: 400 })
      if (geminiRes.status === 429) return NextResponse.json({ error: 'Limite da API atingido. Aguarda alguns segundos.' }, { status: 429 })
      return NextResponse.json({ error: `Erro Gemini: ${geminiRes.status}` }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'

    const clean = rawText.replace(/```(?:json)?[\r\n]*/g, '').replace(/```/g, '').trim()

    let transactions: { data: string; descritivo: string; valor: number }[] = []
    try {
      const parsed = JSON.parse(clean)
      transactions = Array.isArray(parsed) ? parsed : []
    } catch {
      const match = clean.match(/\[[\s\S]*\]/)
      if (match) {
        try { transactions = JSON.parse(match[0]) } catch { transactions = [] }
      }
    }

    transactions = transactions
      .map(t => ({
        data: String(t.data ?? '').trim(),
        descritivo: String(t.descritivo ?? '').trim(),
        valor: Number(t.valor) || 0,
      }))
      .filter(t => t.data && t.descritivo && t.valor !== 0)

    return NextResponse.json({ transactions, count: transactions.length })

  } catch (err: any) {
    console.error('Parse route error:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
