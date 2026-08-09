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

### Filtro de transacções por descrição
Ecrã "Ver todas as transações" → Filtros: campo de texto livre, substring
case-insensitive sobre `descritivo` (ex: "cartão" apanha todos os pagamentos
de cartão de crédito). `Filters.descricao`, `FilterSheet` — page.tsx.

### Marca "Bio" (rebrand, 2026-08-07)
App renomeada de "Finance"/"Balance it out" para **Bio** — acrónimo de
"Balance It Out" (B-I-O), revelado só no ecrã de login/loading (o resto da
app usa só "Bio", curto). Ícone: pulso que se resolve em barras ascendentes,
verde/turquesa, gerado por código via `next/og` `ImageResponse` —
`src/app/icon.svg` (favicon), `apple-icon.tsx` (180×180),
`icon-192.png/route.tsx` e `icon-512.png/route.tsx` (manifest PWA).
Componente `BioIcon` reutilizado no cabeçalho (20px), login (56px) e
loading (56px). Ecrã de login: glow verde ambiente atrás do ícone + botão
"Entrar" verde (era laranja, sobra da paleta antiga) — sem bordas coloridas
no cartão, por preferência do Filipe. Loading tem duração mínima de 1,5s
(`minSplashElapsed`) para não piscar ilegível quando os dados carregam
depressa.

### Tendência do Património — bug corrigido (2026-08-09)
O gráfico de 5 meses do ecrã Património **não usava dados reais** — era uma
rampa sintética (`totalBruto * (0.9 + i*0.025)`), por isso o ponto mais
recente batia com "Total Bruto" e não com "A tua quota" (Hero mostra a
quota). Corrigido: agora reconstrói o saldo real de cada mês partindo da
quota actual (`minhaQuota`) e recuando mês a mês, subtraindo o fluxo líquido
ponderado desse mês (soma das transações × `my_ownership_pct`, contas
pessoal/familiar/investimento, cartões sempre excluídos — mesma regra do
`accountSaldoTotal`). Sem histórico inventado, só soma das transações reais,
tal como os outros gráficos de tendência já fazem para receitas/despesas.
`PatrimonioScreen` — page.tsx.

---

## Saúde Financeira ✅

Feature de sustentabilidade financeira, considerada **funcionalmente completa**
desde 2026-08-06/07 (várias rondas de iteração no mesmo dia — layout, janela
deslizante, revisão de transferências, aprendizagem). Nome final no Hero:
**"Saúde Financeira"** (por extenso, não abreviado).

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
- Severidade por **desvio relativo à meta** (não pontos percentuais
  absolutos): <10% = ok, 10-25% = atenção, >25% = fora
- Janela: **deslizante** (Mensal/3M/6M/12M/Personalizado), default 6 meses,
  persistida por utilizador em `profiles.saude_window_months` — vive só
  dentro do ecrã Saúde, não é campo global em Definições
- Reutiliza infra-estrutura existente: `my_ownership_pct` para pesar contas
  Familiares, sem sistema novo

### UI
Botão "Saúde Financeira" no Hero (canto superior direito, ancorado à base do
saldo grande via CSS Grid; a navegação de mês fica numa shape ao lado, sem
fundo, ancorada à base do título — 2 shapes isoladas e centradas uma na
outra; só aparece nas tabs Familiar e Pessoal).

Ecrã: toggle de âmbito (Pessoal/Familiar/Ambos), navegação de período com um
chip "NM ▾" ancorado ao canto direito dessa linha (menu com Mensal/3M/6M/12M/
Personalizado). "Rendimento considerado" é clicável — abre uma auditoria de
todas as entradas da janela (conta, data, valor, se conta ou está marcada
como transferência), no mesmo espaço onde o detalhe de um balde abre (nunca
os dois ao mesmo tempo, nunca empurra a grelha). Grelha fixa de 3 baldes,
painel de detalhe com toggle Categorias/Transações — as transações são
clicáveis e abrem o popup de edição.

Revisão de transferências: card "N por validar" (mesmo padrão do "por
associar" de Imóveis, contagem global não filtrada à janela) → fila com 3
acções rápidas (Ignorar interna / Investimento / Guilt-free) + cada linha
clicável para abrir o popup completo (dá acesso a Fixos e a mais contexto,
para os casos que os 3 atalhos não cobrem). Lista exaustiva "Transferências
identificadas" mostra todos os níveis (alta e média confiança), resolvidos
ou não, também clicável.

### Ajuste manual + aprendizagem (`saude_override` / `saude_rules`)
Coluna `transactions.saude_override` (nullable: `'fixos'|
'poupanca_investimento'|'guilt_free'|'transferencia'`) — ajuste explícito por
transação, sempre a vencer sobre heurística e categoria. No popup de edição,
aparece como pills: 2 opções se for receita (Rendimento/Transferência
interna), 4 se for despesa de categoria "Transferências" **ou
"Investimentos"** (Fixos/Poupança & Investimento/Guilt-free/Transferência
interna — Investimentos entra porque reaplicar um depósito que venceu é
capital reciclado, não investimento novo), 3 nas restantes categorias (só os
baldes, sem opção de transferência). Uma pill vem pré-seleccionada pela
heurística/regra, com nota "ainda não confirmada" até se tocar noutra.

Tabela `saude_rules` (novo, mesmo padrão de `category_rules`/
`extractPattern`/`matchRule` já existente para categorias): guarda
padrão-do-descritivo → `saude_override` aprendido. Cada vez que o utilizador
confirma uma classificação (popup ou fila de revisão), a regra é
criada/reforçada (`learnSaudeOverride`); a partir daí aplica-se
automaticamente a **toda** transação passada ou futura com descritivo
parecido — sem precisar de lógica especial para casos como "pagamento cartão
de crédito" ou transferências que mencionam o próprio nome do titular.
Prioridade de classificação: override explícito > regra aprendida >
heurística de pares/categoria. RLS: policy simples `for all to authenticated
using (true)`, tabela sem `account_id` (aprendizagem partilhada, tal como
`category_rules`).

Heurística de pares: 2 níveis, só entre transacções de categoria ambígua
(`'Transferências'`, `'Receita'`, ou sem categoria — uma despesa já
categorizada como Transportes/Restauração/etc. nunca é posta em causa só por
coincidência de valor). Alta confiança = valor simétrico exacto, ≤1 dia,
exclui automaticamente. Média confiança = tolerância até max(2€,5%), ≤5
dias, vai para a fila de revisão.

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

---

## IRS — Anexo F (rendimentos prediais) ✅

Reporta os imóveis arrendados para o Anexo F do IRS (Categoria F). Pesquisa
feita no PDF oficial do formulário (Portal das Finanças) e nas instruções de
preenchimento — não a partir de blogs, para evitar erros de categoria/regime.

### Estrutura
- **3 ecrãs**, acedidos por um card "IRS — Rendimentos Prediais" no ecrã
  Imóveis: `IrsConfigScreen` (dados fixos por imóvel — datas do contrato, nº
  de arrendatários, identificação matricial, sugestão de regime), 
  `IrsResumoScreen` (resumo agregado + casa a casa, drill-down por
  categoria até à transação, taxa editável), `IrsMappingScreen` (facsímile
  do formulário real, fundo claro de propósito, para transcrição directa)
- Schema: `imoveis` ganhou `contrato_data_inicio/fim`, `num_arrendatarios`,
  `freguesia_codigo`, `matricial_tipo/artigo/fraccao`, `irs_tipologia`,
  `irs_taxa_override`. Categorização de gastos reaproveita
  `transactions.subcategoria` (campo já existente, sem uso anterior) — pill
  novo "Balde IRS" no `TxnEditForm`, só visível quando a transação tem
  `imovel_id` e é despesa
- **Regime (Quadro 4.1 vs 4.2)** calculado a partir da duração do contrato
  (`sugerirRegimeIrs`) — não é um botão manual, é sugestão automática com
  nota a lembrar da obrigação de comunicação à AT até 15/Fev para o 4.2
  valer. `irs_taxa_override` permite corrigir a taxa manualmente por imóvel
- **Conservação vs Valorização**: subcategoria própria `valorizacao`
  (nunca soma para dedução — só obras de conservação/manutenção reais
  contam). Distinção confirmada nas instruções oficiais (obras que
  valorizam o imóvel, tipo piscina/painéis solares, não são dedutíveis
  aqui — só relevantes para mais-valias na venda)
- **Multi-arrendatário**: 1 linha por arrendatário no mapeamento (Quadro
  4.1/4.2 só tem 1 campo de NIF por linha), renda e gastos divididos em
  partes iguais — `buildIrsLinhas`. NIF de cada arrendatário não é
  guardado pela app (simplificação pedida pelo Filipe) — preenche-se à mão
  no Portal das Finanças
- **Co-propriedade**: não gera linhas extra — usa o `ownership_pct` que já
  existe em `imoveis` (mesmo campo do Património), aplicado antes da
  divisão por arrendatários. Cada co-proprietário declara a sua quota na
  própria declaração, separada
- **Limite de renda 2024+** (Portaria 176/2019, escalão E6 — Lisboa,
  único concelho relevante hoje): tabela 2024 confirmada no diploma
  oficial (Portaria 53/2024), valores 2025/2026 **calculados por nós**
  via coeficiente de actualização de rendas (não há despacho publicado
  confirmado) — `IRS_LIMITE_RENDA_E6`. Só entra em jogo se o imóvel tiver
  `irs_tipologia` definida e contrato 2024+

### Taxa de IRS — por confirmar
Tabela usada (por regime): não habitacional 28%, habitacional Quadro 4.1
25%, Quadro 4.2 15%/10%/5% (5-10/10-20/20+ anos). **Não confirmámos** se o
OE2026 mudou isto — várias fontes secundárias dizem que sim (25%→10% para
"renda moderada"), mas a análise oficial da Ordem dos Contabilistas
Certificados ao OE2026 não mostra nenhuma alteração ao artigo 72.º do CIRS
além de uma cláusula sobre bombeiros, o que contradiz essas fontes. Ficou
combinado avançar com a tabela acima (mais sólida) e o Filipe confirma à
parte — avisa se for diferente. Taxa fica sempre editável por imóvel no
ecrã de resumo, com aviso visível.

---

## Roadmap acordado (ordem de prioridade)

Critério de ordenação: frequência de valor entregue (mensal > anual) supera
risco técnico bruto.

1. **Saúde financeira** ✅ feita (ver secção acima)
2. **Nome + logo novo** ✅ feito (2026-08-07) — app renomeada **Bio** ("Balance
   It Out", acrónimo B-I-O, revelado só no ecrã de login/loading). Ícone:
   pulso que se resolve em barras ascendentes, verde/turquesa, gerado por
   código via `next/og` `ImageResponse` — `src/app/icon.svg` (favicon),
   `apple-icon.tsx` (180×180), `icon-192.png/route.tsx` e
   `icon-512.png/route.tsx` (manifest PWA). Componente `BioIcon` em
   `page.tsx` reutilizado no cabeçalho (20px), login (56px) e loading
   (56px). `manifest.json` e `layout.tsx` actualizados. Ecrã de loading tem
   duração mínima de 1,5s (`minSplashElapsed`) para não piscar ilegível
   quando os dados carregam depressa.
3. **Excel na Drive (custos da casa)** — substitui trabalho manual mensal do
   Filipe. **Bloqueado**: precisa do ficheiro real (estrutura/colunas) e de
   alargar o scope OAuth do Drive de leitura para escrita (reconsentimento,
   possível novo aviso "app não verificada" mais sensível que o actual)
4. **Relatório IRS anual (Anexo F — rendimentos prediais)** ✅ feito
   (2026-08-09, ver secção própria abaixo)

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
