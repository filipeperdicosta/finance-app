import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/googleDrive'

// Valida a sessão Supabase do pedido (header `Authorization: Bearer <access_token>`) e devolve
// o id do utilizador VERIFICADO — nunca confiar num `user_id` vindo do cliente.
// Uso: const auth = await requireUser(req); if (auth instanceof NextResponse) return auth
export async function requireUser(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return NextResponse.json({ error: 'Configuração em falta' }, { status: 500 })

  const { data, error } = await createClient(url, anonKey).auth.getUser(token)
  if (error || !data.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  return { userId: data.user.id }
}

// A conta pertence ao utilizador? (membro activo em account_users). Usa a service role, por isso
// TEM de ser chamado antes de qualquer escrita/leitura em nome de um `account_id` vindo do cliente.
export async function userOwnsAccount(userId: string, accountId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('account_users')
    .select('account_id')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

export const forbidden = () => NextResponse.json({ error: 'Sem acesso a esta conta' }, { status: 403 })
