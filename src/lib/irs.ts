// ─────────────────────────────────────────────────────────────────
// IRS — ANEXO F (rendimentos prediais) — lógica pura, sem dependência de React
// ─────────────────────────────────────────────────────────────────
// Extraído de page.tsx para ser reutilizável tanto pelo ecrã (cliente) como pela
// rota de sincronização do LedgerAuto (servidor) — evita duplicar as regras de
// inclusão/exclusão/mapeamento em dois sítios.
import type { Imovel, Transaction } from './supabase'

// Um balde por cada coluna real do Quadro 4001 do Anexo F, na mesma ordem do formulário,
// + "nao_dedutivel" (não existe no formulário — é interno, para arrumar qualquer custo do
// imóvel que não seja dedutível: obras de valorização, utilities, etc.).
export const IRS_SUBCATEGORIAS = ['conservacao_manutencao','condominio','imi','imposto_selo','taxas_autarquicas','outros','nao_dedutivel'] as const
export type IrsSubcategoria = typeof IRS_SUBCATEGORIAS[number]
export const IRS_SUBCATEGORIA_LABELS: Record<IrsSubcategoria,string> = {
  conservacao_manutencao:'Conservação e Manutenção', condominio:'Condomínio', imi:'IMI',
  imposto_selo:'Imposto do Selo', taxas_autarquicas:'Taxas Autárquicas', outros:'Outros',
  nao_dedutivel:'Não dedutível',
}
// Coluna do formulário oficial (Quadro 4.1/4.2) a que cada subcategoria corresponde —
// "nao_dedutivel" nunca soma, por isso fica de fora.
export const IRS_FORM_COLUMN: Partial<Record<IrsSubcategoria,'conservacao'|'condominio'|'imi'|'selo'|'taxas'|'outros'>> = {
  conservacao_manutencao:'conservacao', condominio:'condominio', imi:'imi',
  imposto_selo:'selo', taxas_autarquicas:'taxas', outros:'outros',
}
export const IRS_FORM_COLUMN_LABELS: Record<'conservacao'|'condominio'|'imi'|'selo'|'taxas'|'outros',string> = {
  conservacao:'Conservação e Manutenção', condominio:'Condomínio', imi:'IMI',
  selo:'Imposto do Selo', taxas:'Taxas Autárquicas', outros:'Outros',
}
export const HABITACIONAL_TIPOS = new Set(['apartamento','moradia'])

// Limites gerais de preço de renda por tipologia — Portaria 176/2019, Anexo I, escalão E6
// (Lisboa — único concelho relevante hoje). Base 2024 (Portaria 53/2024) + coeficiente anual
// de actualização das rendas (2025: 2,16%; 2026: 2,24%), arredondado ao euro acima, como a lei manda.
// Calculado por nós — confirmar despacho oficial se/quando publicado.
// Usado só para validar o tecto de 150% do Quadro 4.2 (art. 72º nº23 CIRS) — mecanismo mais
// antigo, distinto da "renda moderada" da Lei 73-A/2025 (ver IRS_LIMITE_RENDA_MODERADA abaixo,
// que usa uma referência diferente, não esta tabela).
export const IRS_LIMITE_RENDA_E6: Record<'2024'|'2025'|'2026', Record<'T0'|'T1'|'T2'|'T3'|'T4'|'T5', number>> = {
  '2024': {T0:600, T1:900,  T2:1150, T3:1375, T4:1550, T5:1700},
  '2025': {T0:613, T1:920,  T2:1175, T3:1405, T4:1584, T5:1737},
  '2026': {T0:627, T1:941,  T2:1202, T3:1437, T4:1620, T5:1777},
}
// Limite geral aplicável a um ano (tabela só cobre 2024-2026 — anos fora disso usam o
// extremo mais próximo, por falta de despacho publicado).
export function limiteRendaAplicavel(tipologia:Imovel['irs_tipologia'], ano:number): number|null {
  if(!tipologia) return null
  const anoKey = String(Math.min(2026,Math.max(2024,ano))) as '2024'|'2025'|'2026'
  return IRS_LIMITE_RENDA_E6[anoKey][tipologia]
}

// Limite de "renda moderada" para a taxa de 10% da Lei 73-A/2025 — ao contrário do E6 acima,
// a cobertura de imprensa descreve isto como um valor ÚNICO nacional (não por concelho/
// tipologia): ~2,5× a Retribuição Mínima Mensal Garantida. Derivado, não confirmado no
// diploma — Doutor Finanças e ECO citam ambos €2 300 para 2026, mas nenhum reproduz o texto
// legal. Só cobre 2026 (a lei só existe a partir daí) — corrigir aqui se/quando o valor
// oficial (ou a fórmula exacta, e a sua actualização em anos seguintes) for confirmado.
export const IRS_LIMITE_RENDA_MODERADA_2026 = 2300
export function limiteRendaModerada(ano:number): number|null {
  return ano===2026 ? IRS_LIMITE_RENDA_MODERADA_2026 : null
}

// Duração aproximada do contrato, em anos — a data de fim é inclusiva (um contrato "de 5
// anos" com início 14/07/2025 escreve-se com fim 13/07/2030, não 14/07/2030), por isso soma-se
// 1 dia ao fim antes de calcular; senão um contrato de 5 anos certos ficava sempre a dar
// 1 dia a menos que 5 anos.
export function contratoDuracaoAnos(inicio:string|null, fim:string|null): number|null {
  if(!inicio || !fim) return null
  const ms = (new Date(fim).getTime()+86400000) - new Date(inicio).getTime()
  if(!(ms>0)) return null
  return ms/(365.25*86400000)
}

export type IrsRegime = { quadro:'4.1'|'4.2'|'4.1-moderada', taxa:number, escalao:string|null, habitacional:boolean }
// Sugestão de regime/taxa — o override manual (irs_taxa_override) vence sempre, mas o quadro
// continua a ser calculado (duração para 4.2, renda para a nova "4.1-moderada"), para saberes
// que tabela usar.
//
// "4.1-moderada": Lei n.º 73-A/2025 (Orçamento do Estado 2026), publicada em Diário da
// República a 30/12/2025, altera o art. 72º do CIRS — taxa de 10% para arrendamento
// habitacional com renda dentro do limite "moderado" (IRS_LIMITE_RENDA_MODERADA_2026, um
// valor único nacional — NÃO a tabela E6, que é de um mecanismo diferente e mais antigo,
// confundida aqui numa versão anterior), em contratos novos ou já existentes (inclui os já em
// Quadro 4.2 por duração — a lei fala em "todos os contratos com rendas moderadas"). Montado a
// partir de cobertura de imprensa (Doutor Finanças, ECO), NÃO do texto do diploma — falta
// confirmar o valor exacto e se realmente compete com o Quadro 4.2 desta forma. Por segurança,
// só troca para 10% quando é mais favorável do que o regime base (nunca troca os 5% dos 20+
// anos, por exemplo, para pior). Ignora de propósito o RSAA (isenção a 0% para renda ≤80% da
// mediana, em vigor 1/Set/2026) — regime à parte, ainda por implementar.
export function sugerirRegimeIrs(im:Imovel, ano?:number, rendaMediaMensal100?:number|null): IrsRegime {
  const habitacional = HABITACIONAL_TIPOS.has(im.tipo)
  const anos = contratoDuracaoAnos(im.contrato_data_inicio, im.contrato_data_fim)

  let base: IrsRegime
  if(!habitacional || anos==null || anos<5){
    base = { quadro:'4.1', taxa: habitacional?25:28, escalao:null, habitacional }
  } else {
    let taxa=15, escalao='5 a 10 anos'
    if(anos>=20){ taxa=5; escalao='20+ anos' }
    else if(anos>=10){ taxa=10; escalao='10 a 20 anos' }
    base = { quadro:'4.2', taxa, escalao, habitacional }
  }

  if(habitacional && ano!=null && rendaMediaMensal100!=null && 10<base.taxa){
    const limite = limiteRendaModerada(ano)
    if(limite!=null && rendaMediaMensal100<=limite){
      return { quadro:'4.1-moderada', taxa: im.irs_taxa_override ?? 10, escalao:'Renda moderada', habitacional }
    }
  }

  return { ...base, taxa: im.irs_taxa_override ?? base.taxa }
}

export type IrsImovelResumo = {
  imovel: Imovel
  bruto: number
  gastosPorCategoria: Record<IrsSubcategoria,number> // já ponderado pela % de propriedade
  gastosDedutiveis: number
  materiaColectavel: number
  regime: IrsRegime
  imposto: number
  liquido: number
}
export function computeIrsImovel(im:Imovel, transactions:Transaction[], ano:number, use100=false): IrsImovelResumo {
  const pct = use100 ? 1 : im.ownership_pct/100
  const anoTxns = transactions.filter(t=>t.imovel_id===im.id && t.data.startsWith(String(ano)))
  // Todo o rendimento do imóvel conta como renda por defeito — só fica de fora quando marcado
  // explicitamente como "não é renda" (ex: reembolso de utilities pago pelo arrendatário).
  const rendaTxns = anoTxns.filter(t=>Number(t.valor)>0 && t.subcategoria!=='nao_renda')
  const bruto = rendaTxns.reduce((s,t)=>s+Number(t.valor)*pct,0)
  // Bruto a 100% (independente do `use100` pedido) só para o teste de renda moderada — o
  // limite legal é sobre a renda total do contrato, nunca sobre a tua quota de propriedade
  // (mesma regra que já se aplicava à validação do Quadro 4.2, art. 72º nº23 CIRS).
  const bruto100 = rendaTxns.reduce((s,t)=>s+Number(t.valor),0)
  const gastosPorCategoria = {} as Record<IrsSubcategoria,number>
  IRS_SUBCATEGORIAS.forEach(c=>{ gastosPorCategoria[c]=0 })
  anoTxns.filter(t=>Number(t.valor)<0 && t.subcategoria && (IRS_SUBCATEGORIAS as readonly string[]).includes(t.subcategoria))
    .forEach(t=>{ gastosPorCategoria[t.subcategoria as IrsSubcategoria] += Math.abs(Number(t.valor))*pct })
  const gastosDedutiveis = IRS_SUBCATEGORIAS.filter(c=>c!=='nao_dedutivel').reduce((s,c)=>s+gastosPorCategoria[c],0)
  const materiaColectavel = Math.max(0, bruto-gastosDedutiveis)
  const regime = sugerirRegimeIrs(im, ano, bruto100/12)
  const imposto = materiaColectavel*(regime.taxa/100)
  return { imovel:im, bruto, gastosPorCategoria, gastosDedutiveis, materiaColectavel, regime, imposto, liquido: bruto-gastosDedutiveis-imposto }
}

// Divide um resumo pelo nº de arrendatários — uma linha por arrendatário, como o formulário exige
export type IrsLinha = { imovel:Imovel, rendaLinha:number, gastos:Record<'conservacao'|'condominio'|'imi'|'selo'|'taxas'|'outros',number> }
export function buildIrsLinhas(resumo:IrsImovelResumo): IrsLinha[] {
  const n = Math.max(1, resumo.imovel.num_arrendatarios||1)
  const gastosCols: Record<'conservacao'|'condominio'|'imi'|'selo'|'taxas'|'outros',number> = {conservacao:0,condominio:0,imi:0,selo:0,taxas:0,outros:0}
  IRS_SUBCATEGORIAS.forEach(c=>{
    if(c==='nao_dedutivel') return
    const col = IRS_FORM_COLUMN[c] ?? 'outros'
    gastosCols[col] += resumo.gastosPorCategoria[c]
  })
  return Array.from({length:n},():IrsLinha=>({
    imovel: resumo.imovel,
    rendaLinha: resumo.bruto/n,
    gastos: {conservacao:gastosCols.conservacao/n, condominio:gastosCols.condominio/n, imi:gastosCols.imi/n, selo:gastosCols.selo/n, taxas:gastosCols.taxas/n, outros:gastosCols.outros/n},
  }))
}

// ─────────────────────────────────────────────────────────────────
// LedgerAuto — mapeamento para a Ledger manual do Filipe (Excel/Sheets)
// ─────────────────────────────────────────────────────────────────
export type LedgerTipoMovimento = 'Renda'|'Condomínio'|'IMI'|'Outras dedutíveis'|'Outras não dedutíveis'

// Mapeia uma transacção para a coluna "Tipo de Movimento" da Ledger manual — devolve null
// quando a transacção não deve entrar na LedgerAuto (ainda não classificada para IRS, ou
// receita marcada como não-renda). Mesma regra de inclusão/exclusão usada em computeIrsImovel,
// só que aqui devolve o balde "achatado" da Ledger em vez do balde detalhado da app.
// `semRendaActiva` — imóvel sem renda activa (Imovel.ativo=false, ex: Casal): não é relevante
// para IRS, mas o Filipe quer sempre acompanhar os custos, por isso toda a transacção cai em
// "Outras não dedutíveis" sem precisar de classificação manual por balde (pedido do Filipe,
// 2026-08-12 — "opção C").
export function ledgerTipoMovimento(t: Transaction, semRendaActiva = false): LedgerTipoMovimento | null {
  if (semRendaActiva) return 'Outras não dedutíveis'
  const valor = Number(t.valor)
  if (valor > 0) {
    return t.subcategoria === 'nao_renda' ? null : 'Renda'
  }
  if (!t.subcategoria) return null
  switch (t.subcategoria as IrsSubcategoria) {
    case 'condominio': return 'Condomínio'
    case 'imi': return 'IMI'
    case 'nao_dedutivel': return 'Outras não dedutíveis'
    case 'imposto_selo':
    case 'taxas_autarquicas':
    case 'outros':
    case 'conservacao_manutencao':
      return 'Outras dedutíveis'
    default:
      return null
  }
}
