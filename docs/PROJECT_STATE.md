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
  `imovel_id` e é despesa. `IRS_SUBCATEGORIAS` tem **7 baldes**: as 6
  colunas reais do Quadro 4001 do Anexo F (Conservação e Manutenção,
  Condomínio, IMI, Imposto do Selo, Taxas Autárquicas, Outros) + Não
  dedutível — simplificado de 10 (2026-08-09, a pedido do Filipe: "porque
  colocas 10 baldes se o IRS pede estes?"); os 4 removidos (Seguro,
  Certificado Energético, Honorários, Comissão) caíam todos em "Outros" no
  mapeamento de qualquer forma, granularidade sem uso real. Fila "Por
  classificar" (`IrsUnclassifiedQueue`) mostra os baldes como pills
  clicáveis directamente na lista (mesmo padrão do `AssignQueue` de
  imóveis), sem precisar de abrir o popup completo
- **Regime (Quadro 4.1 vs 4.2)** calculado a partir da duração do contrato
  (`sugerirRegimeIrs`) — não é um botão manual, é sugestão automática com
  nota a lembrar da obrigação de comunicação à AT até 15/Fev para o 4.2
  valer. `irs_taxa_override` permite corrigir a taxa manualmente por imóvel.
  `contratoDuracaoAnos` conta a data de fim **inclusive** (+1 dia antes de
  subtrair) — um contrato "de 5 anos" com início 14/07/2025 escreve-se com
  fim 13/07/2030, não 14/07/2030 (convenção normal de contratos PT); sem o
  +1 dia, um contrato de 5 anos certos dava sempre 1 dia a menos que 5 anos
  e caía incorrectamente no Quadro 4.1 (bug real, apanhado pelo Filipe
  2026-08-09)
- **Conservação vs custos não dedutíveis**: subcategoria própria
  `nao_dedutivel` (nunca soma para dedução — só obras de
  conservação/manutenção reais contam). Cobre obras de valorização (tipo
  piscina/painéis solares — só relevantes para mais-valias na venda, não
  aqui) mas também qualquer outro custo não dedutível (ex: utilities) —
  generalizado a pedido do Filipe (2026-08-09), inicialmente só cobria
  valorização
- **Multi-arrendatário**: 1 linha por arrendatário no mapeamento (Quadro
  4.1/4.2 só tem 1 campo de NIF por linha), renda e gastos divididos em
  partes iguais — `buildIrsLinhas`. NIF de cada arrendatário não é
  guardado pela app (simplificação pedida pelo Filipe) — preenche-se à mão
  no Portal das Finanças
- **Co-propriedade**: não gera linhas extra — usa o `ownership_pct` que já
  existe em `imoveis` (mesmo campo do Património), aplicado antes da
  divisão por arrendatários. Cada co-proprietário declara a sua quota na
  própria declaração, separada — **os valores mostrados no ecrã de resumo
  já são a quota do utilizador (ownership_pct), não a totalidade do
  imóvel** (confirmado 2026-08-10, a pedido do Filipe)
- **Rendimento não-renda**: campo "Tipo de rendimento (IRS)" no
  `TxnEditForm`, só em receitas com imóvel associado — grava
  `subcategoria='nao_renda'` quando marcado, excluído do `bruto` em
  `computeIrsImovel`. Por defeito tudo é renda (sem necessidade de
  classificar recibo a recibo); usado para reembolsos de utilities pagos
  pelo arrendatário que não são rendimento predial (pedido do Filipe,
  2026-08-09)
- **Limite de renda 2024+** (Portaria 176/2019, escalão E6 — Lisboa,
  único concelho relevante hoje): condição **confirmada por research**
  (2026-08-10, via informador.pt — texto do artigo) no **artigo 72º, nº 23
  do CIRS** (aditado pela Lei nº 56/2023, "Mais Habitação"): as reduções
  dos nº 3-5 não se aplicam a contratos de arrendamento habitacional
  celebrados a partir de 1/Jan/2024 cuja renda mensal exceda em 50% os
  limites gerais de preço por tipologia das tabelas 1 e 2 do anexo I da
  Portaria 176/2019 — por isso `irs_tipologia` só é pedido no
  `IrsConfigScreen` quando `contrato_data_inicio>=2024-01-01`. Tabela 2024
  confirmada no diploma oficial (Portaria 53/2024), valores 2025/2026
  **calculados por nós** via coeficiente de actualização de rendas (não há
  despacho publicado confirmado) — `IRS_LIMITE_RENDA_E6`.
  ✅ **Implementado** (2026-08-10), depois **movido** (mesmo dia): o aviso
  "dentro do limite"/"acima do limite" (citando o art. 72º nº23 CIRS)
  vive agora no cartão de cada imóvel em `IrsResumoScreen`, não no
  `IrsConfigScreen` — o Filipe corrigiu a assunção original: dividir o
  bruto do ano por 12 só faz sentido quando o ano fiscal está completo
  (o `IrsResumoScreen` é onde isso se aplica de facto — o `IrsConfigScreen`
  não tem essa garantia, e a meio de 2026 dava sempre uma média
  sub-avaliada). Usa sempre `resumos100` (bruto a 100%, nunca a quota, já
  que a renda paga é sempre a totalidade) independente do toggle
  100%/quota do ecrã; mostra "(provisória)" quando `ano` é o ano corrente,
  já que mesmo aqui o valor só fica definitivo com o ano encerrado
- **Toggle 100% / Minha quota** (`IrsResumoScreen`, cabeçalho): por
  defeito 100% do imóvel; ao ligar, mostra a tua quota (`ownership_pct`).
  `computeIrsImovel` ganhou um 4º parâmetro `use100`. **Importante**: o
  `IrsMappingScreen` e o aviso de limite de renda usam sempre
  `resumos100`/`resumosQuota` conforme o caso (nunca a variável `resumos`
  do toggle) — não podem variar com uma preferência de visualização, são os
  valores que realmente vão para a declaração

### Bugs resolvidos (IRS/Imóveis, 2026-08-09/10)
- **Janela de 6 meses escondia dados**: `loadAllData()` só carrega
  transações dos últimos ~6 meses (optimização para o resto da app). A fila
  "por associar" (Imóveis) e **todos os totais do ecrã de IRS**
  (`IrsResumoScreen`) dependiam dessa mesma lista — em Agosto, Jan/Fev
  ficavam invisíveis na fila e sub-reportados nos totais de bruto/gastos/
  imposto, sem aviso nenhum. Apanhado pelo Filipe ("só vejo coisas até
  março"). **Fix**: `loadUnclassifiedImovelTxns` (fila, sem limite de data)
  e `loadImovelTxnsForYear` (IRS, ano fiscal completo Jan-Dez) — ambas em
  `supabase.ts`, vão buscar directamente à BD em vez de depender da lista
  já carregada em memória
- **Ordenação da fila de IRS**: `allNaoClassificadas` juntava as transações
  por imóvel primeiro (`flatMap`) e só depois por data — com mais de 1
  imóvel isso quebrava a ordem cronológica global. Fix: `.sort()` final por
  data decrescente
- **Duração do contrato "de 5 anos" a dar 4.997 anos**: ver bullet acima
  (`contratoDuracaoAnos`) — fim exclusivo em vez de inclusivo
- **Pull histórico Enable Banking (conta Herança MBCP)**: tentativa de
  puxar transacções desde 01/01/2026 via `date_from` (parâmetro novo,
  opcional, em `/api/enablebanking/sync`, só usado quando pedido
  explicitamente com 1 conta — nunca pelo sync automático/UI) devolveu
  **0 transacções novas** — a mais antiga na BD continua 2026-03-31. Não
  ficou claro se é limite do PSD2/banco ou se a conta real não teve
  movimentos antes disso (conta só foi criada na app a 17/06/2026). O
  Filipe resolveu importando Jan/Fev por outra via (upload manual) — o
  parâmetro `date_from` ficou no código, inerte, para o caso de precisar
  outra vez

### Ecrã Imóveis — extras (2026-08-10)
- **Reordenar "por imóvel"**: causa raiz de a ordem parecer instável era
  todos os imóveis terem `ordem=5` (nunca diferenciado) — a query
  `.order('ordem')` sem desempate dava ordem indefinida do Postgres.
  Adicionados botões ▲▼ em cada cartão (`moveImovel`), que ao mover
  renumeram `ordem` sequencialmente para todos os imóveis, resolvendo o
  empate de vez
- **Toggle 100% / Minha quota**: o cartão "por imóvel" (Renda/Custos/
  Estado) sempre mostrou 100% do imóvel (nunca ponderava por
  `ownership_pct`) — pedido do Filipe para manter esse default, mas com
  toggle no cabeçalho da secção para ver a quota própria em alternativa

### Taxa de IRS
Tabela usada (por regime): não habitacional 28%, habitacional Quadro 4.1
25%, Quadro 4.2 15%/10%/5% (5-10/10-20/20+ anos). Os valores dos nº 3-5 do
artigo 72º do CIRS foram **confirmados por research** (2026-08-10, via
informador.pt): "redução de 10/15/20 pontos percentuais" sobre a taxa de
25% — dá exactamente 15%/10%/5%, bate certo com a tabela usada.
**Continua por confirmar** se o OE2026 alterou isto: a análise oficial da
Ordem dos Contabilistas Certificados ao OE2026 não mostra nenhuma
alteração ao artigo 72.º do CIRS além de uma cláusula sobre bombeiros, mas
várias fontes secundárias (blogs) dizem que sim — nova taxa de 10% para
"rendas moderadas" a partir de 2026, contradição ainda não resolvida entre
fontes. Ficou combinado avançar com a tabela acima e o Filipe confirma à
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
3. **"LedgerAuto" — sincronização automática com o Excel de controlo do
   Filipe** ✅ **feito e testado de ponta a ponta (2026-08-12/13)**.
   Substitui o trabalho manual mensal do Filipe no Excel de IRS.
   - Decisão de scope: **`drive.file` + Google Picker** (acesso de escrita
     limitado só ao ficheiro escolhido — não a toda a Drive), confirmado
     suficiente também para a Sheets API (risco inicial resolvido)
   - Ficheiro convertido para Google Sheets nativo pelo Filipe ("Controlo
     Financeiro v1.0" → Sheets). Sheet "Ledger" (manual, nunca tocada):
     Data/Mês/Trimestre/Ano/Património/Tipo de Movimento/Movimento/
     Comentário. App escreve na sheet **"LedgerAuto"**, mesmas colunas +
     "Descrição da transação" + "ID interno" — o Filipe monta a própria
     pivot de comparação ao lado da "Análise" manual
   - **Âmbito final** (fechado 2026-08-12, 3 regras): transacções
     associadas a qualquer imóvel entram sempre; imóveis sem renda activa
     (`ativo=false`, ex: "Casal") caem sempre em **"Outras não dedutíveis"**
     sem precisar de classificação manual (o Filipe quer sempre acompanhar
     custos de investimentos/casa/herança, não só o que é dedutível em
     IRS); transacções "Geral" (sem imóvel associado) ficam **de fora** —
     `ledgerTipoMovimento` (`src/lib/irs.ts`), parâmetro `semRendaActiva`
   - **Motor de sync — reconciliação por DELTA** (`src/lib/ledgerSync.ts`),
     não por reescrita completa: emparelha por ID (coluna J) com o que já
     está na sheet — só actualiza células de linhas cujos valores mudaram
     (nunca toca em B/C/D, que são fórmulas, nem em H/Comentário, que é do
     Filipe), remove linhas cuja transacção deixou de ser relevante
     (`deleteDimension`), e acrescenta transacções novas sempre ao **fundo**
     da região gerida (não pela posição cronológica — reordenar exigiria
     `insertDimension` a deslocar tudo, sem ganho real já que são pivot
     tables, não leitura linha-a-linha; o Filipe reordena manualmente se
     precisar). Fronteira por ANO (lê a coluna D, já uma fórmula
     `=YEAR(A...)`) continua a proteger todo o histórico manual anterior ao
     que a app cobre — nunca escreve antes dela
   - Formatação (moeda, contornos) preservada nas linhas já sincronizadas
     (`values.clear`/`values.update` nunca tocam em formatação); linhas
     genuinamente novas (para além do que a sheet alguma vez teve) recebem
     o formato copiado da última linha formatada via `copyPaste`
     (`pasteType: PASTE_FORMAT`) — `copyFormatForNewRows`
   - Range da Table nativa da sheet (moldura com filtros) actualizado a
     cada sync (`extendTableRange`, `updateTable`) — sem isto a pivot table
     do Filipe ficava sempre um passo atrás
   - **Incidente de segurança de dados (quase-perda, 2026-08-12)**: a
     primeira versão assumia linha 2 como 1ª linha de dados e fazia
     `clear`+reescrita a partir daí — sobrescreveu o cabeçalho real (linha
     2) e o histórico manual de 2026 do Filipe. Apanhado por ele via
     screenshot, restaurou os dados manualmente. **Fix**: `FIRST_DATA_ROW=3`
     + fronteira por ano (não por ID — coluna ID vazia falha no 1º sync)
   - Rota `/api/drive/ledger-sync` (botão manual) + hook no
     `check-drive` cron (`syncLedgerAutoForAllUsers`, ignora
     silenciosamente quem não ligou ficheiro); tabela `ledger_auto_config`
     é o "interruptor" (sem linha = sync inerte). Scope OAuth alargado em
     `src/app/api/auth/google/route.ts`: `drive.readonly` + `drive.file`
   - UI: secção "Sincronização com o Excel" no fundo do `IrsResumoScreen`
4. **Relatório IRS anual (Anexo F — rendimentos prediais)** ✅ feito
   (2026-08-09, ver secção própria abaixo)
5. **"Custos Casa" — sincronização automática com o Excel de custos da
   casa da família** ✅ feito e testado (2026-08-13), incluindo a coluna
   Empregada. Ficheiro "Esforço e Orçamento Casa" (Google Sheets nativo,
   15 sheets, só a sheet **"CustosCasa"** é o alvo — 1 linha por mês,
   pré-criada até 2037, colunas Renda/Seguros/Condomínio/IMI/Água/Luz/Gás/
   TV/Empregada + totais em fórmula). Não é a mesma casa do LedgerAuto: é
   a residência da família (conta "Familiar", sem `imovel_id` associado,
   distinta do imóvel "Casal" que é património/investimento).
   - **Classificação por lista branca de entidades conhecidas**
     (`src/lib/custosCasaSync.ts`), não por adivinhação de texto livre —
     uma transacção sem padrão conhecido fica simplesmente de fora (falha
     para o lado seguro). Cada regra exige texto **e** categoria exactos
     (medido directamente no histórico, não assumido — ver tabela):

     | Coluna | Entidade (texto) | Categoria exigida |
     |---|---|---|
     | Renda | `Amort./Renda` | Habitação |
     | Seguros | `ZURICH VIDA` + `TARIFA PLANA SEGUROS` (soma) | Habitação |
     | Condomínio | `Condominio Predio` | Habitação |
     | Água | `EPAL` | Utilities |
     | Luz | `Petrogal` (Galp electricidade) | Utilities |
     | Gás | `LISBOAGAS` | Utilities |
     | TV | `NOS Comunicacoes` | Utilities |
     | Empregada — ordenado | `ORDENADO` ou `FILIPE` | Habitação |
     | Empregada — SS | `PAG.SS` / `IGFSS` | Habitação |

     Seguros e Empregada somados são escritos como fórmula (`=v1+v2`),
     tal como o Filipe já fazia à mão.
   - **IMI fica fora de propósito** (decisão do Filipe, 2026-08-13): é
     anual/raro, out of scope por agora — continua manual
   - **Empregada (coluna N)** — o mais complexo: soma ordenado + Segurança
     Social, mas nenhum dos dois se atribui ao mês da transacção, e sim ao
     mês de trabalho a que se referem (calendário explicado pelo Filipe):
     ordenado pago entre dia 25 do próprio mês e dia 7 do seguinte (dia≤7
     → mês anterior; dia≥8 → mês corrente); SS sempre paga dias 11-20 do
     mês seguinte ao de referência (sempre mês anterior). `prevMonth()`
     faz o desvio. Pagamentos por conta errada (ex: o Filipe pagou SS pelo
     Santander por engano em vez do Abanca) ficam automaticamente de fora
     — a query só olha `budget_tag='familiar'` — e são somados à mão
   - **2 bugs reais apanhados pelo Filipe e corrigidos no mesmo dia**:
     (1) "Petrogal" também aparece em compras de gasóleo (categoria
     Transportes), inflacionando a coluna Luz — Julho chegou a somar
     172,56€ em vez dos 115,93€ reais; (2) sem a categoria exacta por
     regra, "ORDENADO"/"FILIPE" também batiam em transferências grandes
     não relacionadas (categoria Receita/Transferências, valores
     ~2600-2700€). Ambos resolvidos exigindo a categoria certa por regra,
     não só a lista genérica Habitação∪Utilities
   - Janela de sync: mês corrente + 2 anteriores (apanha facturas com
     atraso, ex: Água é bimestral, e pagamentos de Empregada/SS que só
     chegam no mês seguinte), recalculada a cada corrida — nunca toca em
     meses fora da janela, protege todo o histórico sem precisar de
     fronteira explícita como no LedgerAuto (aqui cada mês é 1 linha só)
   - Escreve só nas colunas F,G,H,J,K,L,M,N (nunca em A-E fórmulas, I/IMI,
     O/Acerto manual, nem nas colunas de totais)
   - **Células escritas automaticamente ficam a azul** (texto, via
     `repeatCell`/`PASTE_FORMAT`, nunca toca em valores) — pedido do
     Filipe para nunca ficar em dúvida se um valor igual ao que já tinha
     veio de carregamento manual ou automático. Só marca células com
     conteúdo real, nunca as que ficam vazias por falta de transacção.
     Mesmo mecanismo aplicado ao LedgerAuto
   - **100% automático via cron diário** (`vercel.json`, 5h UTC) — o
     Filipe não precisa de carregar em "Sincronizar agora" (esse botão
     fica só para forçar antes da hora). Tabela `custos_casa_config`
     (mesmo padrão do `ledger_auto_config`) + rota
     `/api/drive/custos-casa-sync` + hook no `check-drive` cron
     (`syncCustosCasaForAllUsers`) + UI em `DriveSettingsScreen` (cartão
     "Custos Casa", reaproveitando o mesmo Picker do LedgerAuto — já não
     precisa de nova configuração OAuth, `drive.file` já cobre)
   - **Nunca sobrescreve correcções manuais** (pedido do Filipe,
     2026-08-13, depois de ter tido de re-adicionar à mão um pagamento de
     SS feito por engano noutro banco): coluna `cell_snapshot` (JSONB) em
     `custos_casa_config` guarda célula-a-célula o que a app escreveu da
     última vez. Antes de reescrever, compara o valor actual na sheet com
     esse registo — se baterem, recalcula normalmente; se não baterem
     (o Filipe mexeu-lhe entretanto), a app nunca mais toca nessa célula
     específica, adopta o valor dele como definitivo dali para a frente.
     Bootstrap cuidadoso na 1ª execução (sem registo anterior): célula já
     preenchida com valor diferente do calculado é tratada como manual por
     omissão (mais seguro do que arriscar apagar uma correcção só por
     ainda não a termos visto); célula vazia ou já correcta não gera
     dúvida. Comparação com tolerância a arredondamento de vírgula
     flutuante (`cellsEqual`), exacta para fórmulas/vazio.

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
- **Google Picker + `drive.file`**: o Picker funciona visualmente sem
  `.setAppId(<número do projecto Cloud>)`, mas sem isso o grant por-ficheiro
  do `drive.file` falha em silêncio (403 `PERMISSION_DENIED` só se revela na
  primeira chamada real à Sheets API). `setAppId` é obrigatório, não opcional.
- **Sheets API — formatação vs valores**: `values.clear`/`values.update`
  nunca tocam em formatação (moeda, contornos ficam sempre). Só
  `batchUpdate` com `copyPaste`/`pasteType:PASTE_FORMAT` copia formato —
  necessário só para linhas genuinamente novas (nunca formatadas antes).
- **Sheets API — locale europeu em fórmulas escritas por nós**: separador
  de argumentos de função é `;` (não `,`) — ex: `=TEXT(A1;"mmm/yy")`. Mas
  dentro de literais numéricos somados directamente (`=46,36+30,25`), o
  separador **decimal** continua a ser `,` — são preocupações diferentes,
  não confundir uma com a outra.
- **Sheets "Tables" (moldura com filtros nativa)**: o `range` não cresce
  sozinho quando se escrevem linhas a mais por baixo — precisa de
  `batchUpdate` com `updateTable` a cada sync para a pivot table não ficar
  sempre um passo atrás.
- **Reconciliação em sheets geridas em conjunto com um humano**: reescrita
  completa (clear+rewrite) é simples mas apaga anotações manuais em células
  que a app não é dona (ex: coluna Comentário) a cada corrida. Delta por ID
  (emparelhar, actualizar só o que mudou, nunca tocar em colunas alheias) é
  mais código mas preserva o trabalho manual — vale a pena a partir do
  momento em que a sheet já não é só gerada por nós.
- **Classificação por lista branca vs. adivinhação de texto livre**: quando
  o conjunto de entidades é pequeno e fechado (poucos débitos directos
  recorrentes, sempre o mesmo texto de merchant), reconhecer por padrão
  conhecido é seguro. Adivinhar por categoria genérica da app (ex:
  "Habitação" inclui desde condomínio a compras na Leroy Merlin) não é —
  falha para o lado seguro (não escreve) sempre que não há padrão
  reconhecido, nunca inventa.
- **Nomes `*.vercel.app` são um namespace global partilhado** — qualquer
  conta pode reclamar um subdomínio livre, tal como um domínio normal.
  Antes de planear uma escada de nomes (ex: `-alpha`→`-beta`→final),
  confirmar que TODOS os passos estão livres — descobrimos tarde que
  `bio-alpha`/`bio-beta`/`bio` já pertenciam a outra conta. Renomear o
  domínio faz-se em Vercel → Settings → Domains (editar o campo directamente),
  **não** em Settings → General → Project Name (esse não migra o domínio
  automático já reclamado).
- **Corrupção de `.git/refs/heads/main` (recorrente nesta máquina, já
  aconteceu 2x na mesma sessão)**: falha transitória de escrita em disco
  deixa o ficheiro do ref a zeros/vazio — `git push`/`git status` falham
  com "unable to resolve reference" ou "cannot lock ref". **Nunca é perda
  de dados** — o commit continua intacto na base de objectos, só o
  ponteiro do ref é que se perde. Diagnóstico seguro (nunca destrutivo):
  `git log --oneline -5` sobre `.git/logs/refs/heads/main` (reflog local)
  e `.git/logs/refs/remotes/origin/main` (reflog do remoto) mostram sempre
  o último hash bom; confirmar com `git cat-file -t <hash>` que o objecto
  existe antes de tocar em nada. Fix: `rm .git/refs/heads/main && git
  update-ref refs/heads/main <hash>`. Se `git push` a seguir disser
  "Everything up-to-date" inesperadamente, correr `git fetch origin main`
  primeiro — o push original pode já ter chegado ao GitHub antes do lock
  falhar localmente.
