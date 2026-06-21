import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/googleDrive'

// Lista ficheiros (PDF/Excel/CSV) dentro de uma pasta específica da Drive.
// Pagina automaticamente para devolver TODOS os ficheiros (a API limita a 100 por página).
// GET /api/drive/files?user_id=...&folder_id=...
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id')
  const folderId = req.nextUrl.searchParams.get('folder_id')

  if (!userId || !folderId) return NextResponse.json({ error: 'user_id ou folder_id em falta' }, { status: 400 })

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'Drive não ligada ou token inválido' }, { status: 401 })

  // PDF, Excel (.xlsx/.xls), CSV
  const mimeFilter = [
    "mimeType = 'application/pdf'",
    "mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
    "mimeType = 'application/vnd.ms-excel'",
    "mimeType = 'text/csv'",
  ].join(' or ')
  const q = encodeURIComponent(`'${folderId}' in parents and (${mimeFilter}) and trashed = false`)
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime,size)')

  try {
    let allFiles: any[] = []
    let pageToken: string | undefined = undefined

    do {
      const pageParam = pageToken ? `&pageToken=${pageToken}` : ''
      const res: Response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name desc&pageSize=1000${pageParam}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) {
        const errText = await res.text()
        console.error('Drive list files error:', res.status, errText)
        return NextResponse.json({ error: `Erro Drive: ${res.status}` }, { status: 500 })
      }
      const data: any = await res.json()
      allFiles = allFiles.concat(data.files ?? [])
      pageToken = data.nextPageToken
    } while (pageToken)

    return NextResponse.json({ files: allFiles })
  } catch (err: any) {
    console.error('Drive files exception:', err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
