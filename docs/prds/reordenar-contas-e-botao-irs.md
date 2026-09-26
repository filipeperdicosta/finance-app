# PRD — Reordenar contas + Botão IRS no Hero

Estado: aprovado, a implementar. Item relacionado (selecção múltipla de contas/imóveis)
fica de fora deste PRD — decide-se à parte depois de ver o mockup.

## 1. Reordenar contas (Pessoal, Familiar, Contas de investimento em Imóveis)

### Problema
As listas de contas em Pessoal, Familiar e a lista "Contas" (investimento) dentro de
Imóveis aparecem sempre pela mesma ordem (hoje: `nome`, vindo da query), sem forma de o
Filipe as reorganizar à sua maneira — ao contrário da lista de imóveis, que já tem
setas ▲▼ (`moveImovel`).

### Solução
Estender o mesmo padrão (setas ▲▼ por linha, reordenar = trocar posições + renumerar
sequencialmente) às listas de contas:
- `AccountList` (componente partilhado por `BudgetScreen` Pessoal e Familiar)
- Lista "Contas" dentro de `ImoveisScreen` (contas de investimento)

### Decisões técnicas
- `accounts.ordem` já existe na BD (é definido na criação, `ordem:accountsLen`), mas
  nunca é lido para ordenar — a query actual ordena por `nome`. **Não vamos mudar essa
  query global** (evitar afectar Definições e outros consumidores de `accounts`);
  em vez disso, cada lista ordena **client-side** por `ordem` (fallback para `nome`
  quando `ordem` for `null`/empatado entre contas antigas, mesma protecção já usada
  para resolver o empate de `ordem` nos imóveis).
- Mover uma conta renumera sequencialmente (0..N-1) só o subconjunto da lista onde a
  seta foi usada (a tag em causa, ou as contas de investimento) — não toca em contas
  de outras tags/listas.
- Sem migração de BD: a coluna já existe.

### Fora de âmbito
- Reordenar na lista global de "Contas" em Definições (`SettingsPanel`) — não pedido.
- Drag-and-drop — mantém-se o mesmo padrão de setas já usado nos imóveis.

### Critérios de aceitação
- Em Pessoal, Familiar e na lista de investimento (Imóveis), cada conta tem setas
  ▲▼ (desactivadas nos extremos da lista) que trocam a posição com a vizinha.
- A nova ordem sobrevive a um refresh da página.
- Contas de outras tags/listas não são afectadas por uma reordenação.

## 2. Botão IRS no Hero (tab Imóveis)

### Problema
O acesso ao ecrã "IRS — Rendimentos Prediais" hoje é um card inteiro, solto por baixo
da barra de valorização — ocupa espaço visual permanente e destoa do padrão já usado
para "Saúde Financeira" (que vive como botão discreto dentro do próprio Hero).

### Solução
- Novo prop opcional `onIrs` no componente `Hero`, reaproveitando exactamente o mesmo
  slot/estilo do botão "Saúde Financeira" (canto inferior direito da grid do Hero,
  ícone + texto, mesmo `T.surface2`/`pal.accent`) — só que com ícone `FileText` e
  texto "IRS". Esse slot está livre no Hero do ecrã Imóveis (só Pessoal/Familiar usam
  hoje o slot para Saúde Financeira).
- Remove o card "IRS — Rendimentos Prediais" solto. O clique no novo botão abre o
  mesmo ecrã de sempre (`showIrs`/`IrsResumoScreen`), sem mudança de comportamento
  para além da localização.

### Critérios de aceitação
- O card antigo do IRS desaparece do ecrã Imóveis.
- Um botão "IRS" aparece no Hero do ecrã Imóveis, no mesmo lugar/estilo do botão
  Saúde Financeira nos ecrãs Pessoal/Familiar.
- Tocar no botão abre o ecrã de resumo do IRS, igual a antes.

## Ficheiros tocados
- `src/app/page.tsx` — `Hero`, `AccountList`, `BudgetScreen`, `ImoveisScreen`.

## Testes
- `npm run build` (TypeScript) antes de dar push.
- Manual: reordenar contas nas 3 listas e confirmar persistência após refresh; abrir o
  ecrã IRS pelo novo botão no Hero de Imóveis.
