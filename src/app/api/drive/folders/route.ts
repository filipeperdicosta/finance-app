import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'

// Lista subpastas dentro de uma pasta da Drive (ou da raiz, se parentId não for dado).
// Inclui também ATALHOS (shortcuts) que apontam para pastas — comum quando alguém
// partilha uma pasta contigo e a adicionas à tua Drive como atalho em vez de cópia.
// GET /api/drive/folders?user_id=...&parent=root
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const parent = req.nextUrl.searchParams.get('parent') || 'root'

  if (!userId) return NextResponse.json({ error: 'user_id em falta' }, { status: 400 })

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

  // Pastas reais + atalhos (shortcuts) — resolvemos os atalhos a seguir
  const q = encodeURIComponent(
    `'${parent}' in parents and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut') and trashed = false`
  )
  const fields = encodeURIComponent('files(id,name,mimeType,shortcutDetails)')

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
    const rawFiles: any[] = data.files ?? []

    // Resolve atalhos: se o destino do atalho for uma pasta, usa o ID/nome da pasta original.
    // Se o destino não for pasta (ex: atalho para um ficheiro), ignora-se.
    const folders = rawFiles
      .map(f => {
        if (f.mimeType === 'application/vnd.google-apps.shortcut') {
          const target = f.shortcutDetails
          if (target?.targetMimeType === 'application/vnd.google-apps.folder') {
            return { id: target.targetId, name: f.name }
          }
          return null // atalho não aponta para uma pasta — ignora
        }
        return { id: f.id, name: f.name }
      })
      .filter((f): f is { id: string; name: string } => f !== null)

    return NextResponse.json({ folders })
  } catch (err: any) {
    console.error('Drive folders exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
