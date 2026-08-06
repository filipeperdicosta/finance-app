# Estado do Projecto — histórico detalhado

> Este ficheiro NÃO carrega automaticamente em cada sessão do Claude Code.
> Lê-o quando precisares de contexto sobre uma feature específica, um bug
> antigo, ou uma decisão passada. Actualiza-o quando fechares trabalho
> relevante — pede para eu (Claude) o fazer no fim de uma sessão.

---

## Funcionalidades completas

### Multi-user (Filipe + Cici)
Schema: `profiles`, `account_users`, `account_invites`. RLS reescrita de
role-based para `account_users`-based (each user vê só contas onde tem
linha activa). RPCs `SECURITY DEFINER` para evitar recursão de RLS:
`create_account`, `get_account_members`, `get_account_pending_invites`,
`accept_invite`, `update_member_ownership`, `cancel_invite`, `find_user_by_email`.

- Convite → aceitar → ownership redistribui automaticamente (1/N ao aceitar,
  proporcional ao editar manualmente — nunca ultrapassa 100%)
- `my_ownership_pct` em `Account` (vem do join com `account_users` do user
  autenticado) — usado em todo o lado onde se precisa da "minha quota"
- Trigger `on_auth_user_created` cria profile automaticamente para novos users

### Enable Banking (PSD2)
Bancos ligados: Revolut, Abanca, MBCP (`Millennium BCP`), Santander
(`Santander Totta` — nome exacto exigido pela API), CGD
(`Caixa Geral de Depósitos`). Nomes ASPSP têm de bater certo com o que a
Enable Banking espera — já tivemos 2 erros 422 por nome errado.

- Ecrã reestruturado: só mostra bancos onde o user TEM conta na BD
  (cruza `accounts.banco` com mapping `dbBanco`), "Por ligar" em cima,
  "Ligados" em baixo com logos reais (Google favicon service)
- Botão de desassociar conta EB (mantém histórico de transacções)
- Santander PT estava bloqueado a nível SCA — **resolvido**, funciona agora

### Google Drive PDF import
- Prompt Gemini melhorado: distingue "Saldo em Dívida" de "Saldo disponível"
  em extractos de cartão de crédito (bug real, saldo errado durante semanas)
- `periodo_fim` prefere data explícita do "Periodo de liquidação" em vez da
  última transacção listada
- Hash desambiguado para transacções idênticas no mesmo lote (ex: duas
  compras de €2,50 no mesmo café, mesmo dia — antes só uma sobrevivia à
  restrição UNIQUE)
- `pdf_gera_transacoes` (boolean por conta): quando `false`, o PDF é
  arquivado mas não gera transacções — usado quando a conta já tem Enable
  Banking a cobrir tudo (evita duplicados sistemáticos)
- Botão "Verificar agora" por conta individual (além do global)
- Botão "raiz" no picker de pastas para navegar do zero
- OAuth do Drive estava em "Testing" no Google Cloud Console → refresh token
  expirava a cada 7 dias. **Resolvido**: mudado para "In production"

### Duplicados suspeitos
`suspeita_duplicado` (boolean) marca transacções com mesma
conta+data+valor mas hash diferente. Wizard dedicado: pares lado a lado,
"Apagar suspeita" ou "Manter ambas". Detecção nas duas fontes (Drive + EB).

Descoberto: EB do Santander às vezes devolve `entry_reference` instável
para lançamentos de liquidação de DP (mesmo timestamp, sufixo diferente a
cada fetch) — causava duplicados a cada corrida do cron. Fix: comparar
também o descritivo normalizado antes de inserir; se bater tudo, ignora
silenciosamente (é o mesmo lançamento, referência instável do banco).

### Notificações
- Bug de privacidade (não crítico — RLS já protegia, mas faltava defesa em
  profundidade no código): 4 funções não filtravam por `user_id`. Corrigido.
- Label de tempo relativo estava errado: usava blocos de 24h corridas em vez
  de dias de calendário — "ontem" e "anteontem" apareciam ambos como "há 1 dia"
- Logging de erros do cron: `files_failed` incrementava mas `errors[]` ficava
  vazio — agora regista a mensagem exacta (ficheiro, conta, motivo)

### Cartão de crédito — modelação
- Excluído dos totais agregados (Hero, Património) — `accountSaldoTotal()`
  devolve 0 para `tipo==='cartão'`. Motivo: o cartão só actualiza 1x/mês via
  PDF; somar ao Património duplicava o valor entre o pagamento real (visível
  na conta corrente via PSD2) e o saldo do cartão ainda não actualizado
- Quando a conta do cartão está **seleccionada** individualmente, mostra o
  valor real (`accountSaldo()`) — aplica-se tanto ao Hero como à própria
  linha na lista de Contas (tinham de andar sincronizados)

### Cartão crédito Abanca (pipeline original)
Bulk histórico via CSV importado. Fluxo mensal PDF validado com o extracto
de Julho real — apanhou os 2 bugs de saldo/hash acima descritos.

---

## Em progresso — Saúde Financeira

Feature de sustentabilidade financeira (4 baldes → simplificado para 3).
Nome final: **"Saúde financeira"**.

### Decisões fechadas
- 3 baldes: **Fixos** (≤50%), **Poupança & Investimento** (≥20%, junção de
  10+10), **Guilt-free** (≤30%) — baseado em variante documentada do 50/30/20
- Herança/Imóveis fica **fora** desta feature (é investimento, não consumo
  pessoal — enquadramento diferente, futuro item #4 do pipeline)
- Âmbito: toggle Pessoal / Familiar / Ambos. Para o Filipe, só "Ambos" faz
  sentido (fixos na Familiar, investimentos na Pessoal), mas o toggle fica
  disponível para outras configurações de família
- Mapeamento categoria→balde é um objecto estático no código
  (`CATEGORY_BUCKET`), não uma tabela na BD
- Transferências entre contas próprias: heurística de **2 níveis** — alta
  confiança (valor simétrico exacto, mesmo dia ou +1) continua a excluir
  automaticamente sem pedir confirmação; média confiança (tolerância até
  max(5€,5%), até 5 dias) + transacções isoladas de categoria
  "Transferências" sem par vão para fila de revisão (implementado
  2026-08-06, ver abaixo)
- Severidade por **desvio relativo à meta** (não pontos percentuais
  absolutos): <10% = ok, 10-25% = atenção, >25% = fora
- Janela: **deslizante** (Mensal/3M/6M/12M/Personalizado), default 6 meses,
  persistida por utilizador em `profiles.saude_window_months` (implementado
  2026-08-06 — já não é só mês a mês)
- Reutiliza infra-estrutura existente: `my_ownership_pct` para pesar contas
  Familiares, sem sistema novo

### UI actual
Pill "Saúde" no Hero (canto superior direito, ancorada à base do valor
grande via CSS Grid; a navegação de mês fica na shape ao lado, ancorada à
base do título — 2 shapes isoladas e centradas uma na outra, só aparece nas
tabs Familiar e Pessoal). Ecrã: toggle de âmbito, navegação por
mês/janela + segmented control da janela deslizante, 3 cards lado a lado
(grelha fixa, nunca deforma), painel de detalhe por baixo com toggle
Categorias/Transações, card "N transferências por validar" (quando há
pendentes, mesmo padrão do "por associar" de Imóveis) + fila de revisão de
transferências (3 acções: Ignorar/Investimento/Guilt-free), lista exaustiva
de transferências identificadas agora clicável (abre o popup de edição da
transação, que ganhou um campo "Balde de Saúde Financeira" para ajuste
manual, mesmo em pares de alta confiança).

### Ajuste manual de balde (`saude_override`)
Coluna nova em `transactions` (`saude_override`, nullable: `'fixos'|
'poupanca_investimento'|'guilt_free'|'transferencia'`). Quando definida,
vence sempre sobre a heurística e o mapeamento categoria→balde —
`'transferencia'` exclui do cálculo, os outros forçam esse balde (só para
despesas; receitas continuam sempre a contar como rendimento,
independentemente do override). `computeSaudeFinanceiraMonth` — page.tsx.

### Bugs resolvidos (Saúde Financeira)
**`ownership_pct` a 100% não reflecte no ecrã — RESOLVIDO (2026-08-06).**
Causa raiz real: **não era bug de código nenhum** — o Filipe estava a editar
o campo "% propriedade" no formulário **Editar Conta** (`AccountForm`),
que escreve na coluna legada `accounts.ownership_pct` via `updateAccount()`
(update directo REST, sem RPC). Esse campo é usado só para semear
`account_users` na **criação** de conta nova (`create_account` RPC); depois
de existirem membros, a % real vive em `account_users.ownership_pct` e só
se edita no ecrã **Membros** (RPC `update_member_ownership`), acedido pelo
ícone 👥 na lista de contas em Definições — não pelo lápis de editar.
Confirmámos por SQL que a RPC `update_member_ownership` sempre funcionou
correctamente (lógica de redistribuição proporcional correcta, RLS não era
bloqueio — owner `postgres` tem `BYPASSRLS`). O diagnóstico incluiu, por
ordem, e todos descartados antes de encontrar a causa real: RLS a bloquear
o UPDATE silenciosamente, overloads da função, view/tabela de leitura
diferente da de escrita, build sem a correcção de erro deployado. O que
resolveu foi inspeccionar o Network tab do browser e ver que a gravação
não gerava nenhum pedido RPC — só aí ficou claro que o ecrã editado era o
errado.
Fix aplicado: campo "% propriedade" agora só aparece no formulário ao
**criar** conta nova (`!isEdit`); ao editar, deixa de ser enviado no
payload de `updateAccount()`, para não voltar a confundir com o campo
legado. `page.tsx` — `AccountForm`, `changePct`.

### Pergunta em aberto (UI)
Pill diz "Saúde" (abreviado) em vez de "Saúde financeira" completo — foi
decisão de espaço (coluna ficou mais estreita). Perguntar se o Filipe
prefere manter curto ou alargar a coluna para caber o texto completo.

---

## Roadmap acordado (ordem de prioridade)

Critério de ordenação: frequência de valor entregue (mensal > anual) supera
risco técnico bruto.

1. **Saúde financeira** ✅ em progresso (ver secção acima)
2. **Nome + logo novo** — actualmente "Balance it out", explorando "Bio"
   como forma curta. Precisa de: decisão criativa (fora do scope técnico) +
   depois `manifest.json`, `apple-touch-icon.png` (180×180), ícones
   192×192/512×512, favicon, ligação no `layout.tsx`
3. **Excel na Drive (custos da casa)** — substitui trabalho manual mensal do
   Filipe. **Bloqueado**: precisa do ficheiro real (estrutura/colunas) e de
   alargar o scope OAuth do Drive de leitura para escrita (reconsentimento,
   possível novo aviso "app não verificada" mais sensível que o actual)
4. **Relatório IRS anual (conta Herança)** — substitui trabalho manual anual.
   Precisa de subcategorias novas (IMI, Imposto de Selo, Taxas Autárquicas,
   Condomínio, Manutenção/Obras, Seguros) que hoje não existem — tudo cai em
   "Habitação" genérico. Requer reclassificação do histórico + relatório
   por imóvel exportável

### Backlog técnico (sem data)
- **Modularizar `page.tsx`** (~3700 linhas) — combinado fazer numa sessão
  dedicada, ainda não começou. Proposta de estrutura: `components/ui`,
  `components/charts`, `components/hero`, `screens/`, `lib/theme.ts`,
  `lib/format.ts`, `lib/calc.ts`
- **Alinhamento gráficos Spark vs DynChart** — on hold, várias tentativas
  falhadas (opção A: XAxis interno no budget mode, opção B: espaçador —
  nenhuma resolveu visualmente). Deixado para outra abordagem no futuro

---

## Aprendizagens e armadilhas conhecidas

- **RLS recursion**: política que consulta a própria tabela em `USING`
  causa recursão infreadável → usar RPC `SECURITY DEFINER` que valida
  permissão manualmente antes de devolver dados
- **Hash determinístico** para identidade de transacção é essencial com
  múltiplas fontes (PSD2 + PDF) — mas cuidado com duplicados **legítimos**
  no mesmo lote (mesma loja, mesmo valor, mesmo dia) — precisa de sufixo de
  ocorrência para não se perderem
- **Vercel + imports dinâmicos** em rotas de cron falham silenciosamente em
  produção — usar sempre imports estáticos no topo do ficheiro
- **Google Cloud OAuth "Testing"**: refresh tokens expiram a cada 7 dias.
  Tem de estar "In production" para tokens de longa duração (ainda que sem
  verificação formal da Google, aceitável para apps pessoais de baixo volume)
- **Santander PT PSD2**: esteve bloqueado a nível SCA — já resolvido, não é
  preciso revisitar
- **Cartão de crédito**: nunca somar ao património agregado — só actualiza
  1x/mês, cria duplicação temporal com o pagamento real na conta corrente
- **Enable Banking**: nomes ASPSP têm de bater exactamente com o que a API
  espera (ex: "Santander Totta", não "Santander"; "Millennium BCP" com 2 L
  e 2 N — já corrigimos um erro de ortografia nosso aqui)
- **Ambiente de desenvolvimento anterior (Claude.ai chat)**: sandbox sem
  persistência entre mensagens — cada resposta tinha de restaurar checkpoint
  + reaplicar deltas. Não se aplica ao Claude Code (filesystem persistente).
