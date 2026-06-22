import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'
import { parseStatementWithGemini, detectMimeType } from '@/lib/geminiParse'

// Descarrega um ficheiro da Drive e processa-o com o Gemini, devolvendo as
// transações e metadados extraídos — SEM gravar nada na base de dados.
// Usado pelo fluxo manual (Importar → Drive → ficheiro), para o utilizador
// poder rever e confirmar antes de qualquer escrita, tal como no upload directo.
// POST /api/drive/preview  body: { user_id, google_file_id, filename }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { user_id, google_file_id, filename } = body

    if (!user_id || !google_file_id || !filename) {
      return NextResponse.json({ error: 'Parâmetros em falta' }, { status: 400 })
    }

    const accessToken = await getValidAccessToken(user_id)
    if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${google_file_id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!fileRes.ok) {
      const errText = await fileRes.text()
      console.error('Falha ao descarregar ficheiro da Drive (preview):', fileRes.status, errText)
      return NextResponse.json({ error: `Erro ao descarregar ficheiro: ${fileRes.status}` }, { status: 500 })
    }

    const bytes = await fileRes.arrayBuffer()
    const sizeMB = bytes.byteLength / (1024 * 1024)
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = detectMimeType(filename)

    const result = await parseStatementWithGemini(base64, mimeType, sizeMB)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      transactions: result.transactions,
      meta: result.meta,
      count: result.transactions.length,
    })

  } catch (err: any) {
    console.error('Drive preview exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
