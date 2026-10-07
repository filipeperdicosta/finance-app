import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'

// Nome e caminho (pastas) de um ficheiro da Drive — para o ecrã de Definições mostrar qual é o
// ficheiro actualmente ligado (LedgerAuto / Custos Casa) em vez de só "Trocar ficheiro".
// GET /api/drive/file-info?user_id=...&file_id=...
async function driveGet(id: string, token: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,parents&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json() as Promise<{ name: string, parents?: string[] }>
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('user_id')
    const fileId = req.nextUrl.searchParams.get('file_id')
    if (!userId || !fileId) return NextResponse.json({ error: 'user_id/file_id em falta' }, { status: 400 })

    const token = await getValidAccessToken(userId)
    if (!token) return NextResponse.json({ error: 'Drive não ligada' }, { status: 401 })

    const file = await driveGet(fileId, token)
    if (!file) return NextResponse.json({ error: 'Ficheiro inacessível' }, { status: 404 })

    // Sobe pela cadeia de pastas (máx. 8 níveis); se alguma pasta não for legível, mostra o que há.
    const folders: string[] = []
    let parent = file.parents?.[0]
    for (let i = 0; parent && i < 8; i++) {
      const p = await driveGet(parent, token)
      if (!p) break
      folders.unshift(p.name === 'My Drive' ? 'O meu disco' : p.name)
      parent = p.parents?.[0]
    }
    return NextResponse.json({ name: file.name, path: folders.join(' / ') })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
