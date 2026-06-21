import { NextRequest, NextResponse } from 'next/server'
import { parseStatementWithGemini, detectMimeType } from '@/lib/geminiParse'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Ficheiro não recebido' }, { status: 400 })

    const mimeType = detectMimeType(file.name)
    const bytes = await file.arrayBuffer()
    const sizeMB = bytes.byteLength / (1024 * 1024)
    const base64 = Buffer.from(bytes).toString('base64')

    const result = await parseStatementWithGemini(base64, mimeType, sizeMB)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ transactions: result.transactions, meta: result.meta, count: result.transactions.length })

  } catch (err: any) {
    console.error('Parse route exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno inesperado' }, { status: 500 })
  }
}
