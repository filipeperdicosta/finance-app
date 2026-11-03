// ─────────────────────────────────────────────────────────────────
// Associação automática de transacções (rendas) a imóveis
// ─────────────────────────────────────────────────────────────────
// Regras aprendidas com a associação manual (tabela `imovel_regras`). Uma entrada de renda
// associa-se sozinha a um imóvel quando:
//   1. o descritivo normalizado é igual ao da regra (mesmo pagador), e
//   2. o valor está dentro de ±tol_pct (5%) do último valor associado — a referência acompanha
//      a actualização anual das rendas, por isso nunca acumula desvio, e
//   3. (opcional, desligado por defeito) o dia do mês está dentro da janela da regra. Fica fora
//      por defeito para não esconder atrasos de pagamento.
// Se mais de um imóvel bater, não adivinha — fica na fila "por associar". Só rendas (valor > 0).
// Partilhado cliente/servidor: as funções puras não importam nada.

export type ImovelRegra = {
  id: string
  imovel_id: string
  pattern: string
  valor_ref: number
  tol_pct: number
  dia_tipico: number | null
  dia_tol: number | null
  vezes_usada: number
  ativa: boolean
}

// Chave estável do pagador: sem acentos, maiúsculas, sem dígitos/datas/referências, sem pontuação.
export function normalizeKey(descritivo: string | null | undefined): string {
  return (descritivo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Z]+/g, ' ')
    .trim().replace(/\s+/g, ' ')
    .slice(0, 60)
}

function diaDentroDaJanela(data: string, diaTipico: number, tol: number): boolean {
  const dia = Number(data.slice(8, 10))
  const diff = Math.abs(dia - diaTipico)
  return Math.min(diff, 31 - diff) <= tol
}

export function regraBate(r: ImovelRegra, t: { descritivo: string | null, valor: number, data: string }): boolean {
  if (!r.ativa || t.valor <= 0) return false
  if (r.pattern !== normalizeKey(t.descritivo)) return false
  if (Math.abs(t.valor - r.valor_ref) > Math.abs(r.valor_ref) * (r.tol_pct / 100)) return false
  if (r.dia_tipico != null && !diaDentroDaJanela(t.data, r.dia_tipico, r.dia_tol ?? 3)) return false
  return true
}

// Mesmo pagador mas valor fora da tolerância (ex: salto de renda) → só sugere, nunca associa.
export function regrasSugeridas(regras: ImovelRegra[], t: { descritivo: string | null, valor: number }): ImovelRegra[] {
  if (t.valor <= 0) return []
  const key = normalizeKey(t.descritivo)
  return regras.filter(r => r.ativa && r.pattern === key)
}

// Servidor (service role): associa as rendas por classificar de UMA conta. Chamada no fim de cada
// ponto de entrada de transacções (Enable Banking, cron, import do Drive). Nunca lança — se a
// tabela ainda não existir ou algo falhar, as transacções ficam simplesmente na fila manual.
export async function autoAssignImovel(supabaseAdmin: any, accountId: string): Promise<number> {
  try {
    const { data: links } = await supabaseAdmin.from('conta_imovel').select('imovel_id').eq('account_id', accountId)
    const imovelIds = (links ?? []).map((l: any) => l.imovel_id)
    if (imovelIds.length === 0) return 0

    const { data: regrasRaw } = await supabaseAdmin.from('imovel_regras').select('*').in('imovel_id', imovelIds).eq('ativa', true)
    const regras = (regrasRaw ?? []) as ImovelRegra[]
    if (regras.length === 0) return 0

    const { data: txns } = await supabaseAdmin.from('transactions')
      .select('id, data, valor, descritivo')
      .eq('account_id', accountId).eq('imovel_classificado', false).gt('valor', 0)
      .order('data', { ascending: true })

    let assigned = 0
    for (const t of (txns ?? []) as { id: string, data: string, valor: number, descritivo: string }[]) {
      const candidatas = regras.filter(r => regraBate(r, { ...t, valor: Number(t.valor) }))
      if (new Set(candidatas.map(r => r.imovel_id)).size !== 1) continue // 0 = sem regra; >1 = ambíguo
      const regra = candidatas[0]
      const { error } = await supabaseAdmin.from('transactions')
        .update({ imovel_id: regra.imovel_id, imovel_classificado: true, imovel_auto: true }).eq('id', t.id)
      if (error) continue
      regra.valor_ref = Number(t.valor) // a referência acompanha o valor (inflação anual)
      regra.vezes_usada += 1
      await supabaseAdmin.from('imovel_regras')
        .update({ valor_ref: regra.valor_ref, vezes_usada: regra.vezes_usada, last_matched_at: new Date().toISOString() })
        .eq('id', regra.id)
      assigned++
    }
    return assigned
  } catch (err: any) {
    console.warn('autoAssignImovel:', err?.message)
    return 0
  }
}
