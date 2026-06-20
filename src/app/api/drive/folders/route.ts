import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'

// Lista subpastas dentro de uma pasta da Drive (ou da raiz, se parentId não for dado).
// GET /api/drive/folders?user_id=...&parent=root
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const parent = req.nextUrl.searchParams.get('parent') || 'root'

  if (!userId) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

  const q = encodeURIComponent(`'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
  const fields = encodeURIComponent('files(id,name)')

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      const errText = await res.text()
      console.error('Drive list folders error:', res.status, errText)
      return NextResponse.json({ error: `Erro Drive: ${res.status}` }, { status: 500 })
    }
    const data = await res.json()
    return NextResponse.json({ folders: data.files ?? [] })
  } catch (err: any) {
    console.error('Drive folders exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
