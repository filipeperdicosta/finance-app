# Finance App — Project State

**Última actualização:** 20 Junho 2026
**Stack:** Next.js 15.3.3 (App Router) · React 18.3.1 · TypeScript · Supabase (PostgreSQL + Auth) · Vercel (deploy) · Google Gemini 2.5-flash-lite (parsing PDF) · GitHub (versionamento)

**URLs:**
- Produção: `finance-app-six-flax.vercel.app`
- Repositório: `github.com/filipeperdicosta/finance-app`
- Supabase project: `vgltihdbtslfyjoawqrl`

**Utilizadores:** Filipe (admin, acesso total) · Cici (role `familiar` definido no schema, UI ainda não restringe)

---

## 1. Arquitectura

### Stack de dados
```
PDF/Excel/CSV → Gemini 2.5-flash-lite (/api/parse) → preview no ImportWizard
             → regras aprendidas (category_rules) têm prioridade sobre sugestão IA
             → confirmação manual → saveTransactions() → Supabase
```

### Tabs da app
- 🟠 **Familiar** — contas+transacções tag `familiar`
- 🟢 **Pessoal** — contas+transacções tag `pessoal`
- 🔵 **Imóveis** — contas tag `investimento`, ligadas N:N a imóveis via `conta_imovel`
- ⚫ **Património** — agregação de todas as contas, com quota por `ownership_pct`

---

## 2. Schema da Base de Dados

### Tabelas principais
```sql
profiles        -- id, nome, email, role['admin'|'familiar']
accounts        -- nome, banco, tipo, budget_tag, titular, ownership_pct,
                -- saldo_atual, saldo_data, iban, numero_conta, ativa, ordem
imoveis         -- nome, local, tipo, ativo, ownership_pct,
                -- valorizacao, valorizacao_data
conta_imovel    -- liga N:N accounts↔imoveis
import_batches  -- account_id, filename, source, periodo_inicio/fim, google_file_id (não usado ainda)
transactions    -- account_id, data, descritivo, valor, categoria,
                -- categoria_confirmada, imovel_id, imovel_classificado, hash UNIQUE
categories      -- 15 categorias fixas (ver abaixo)
category_rules  -- pattern, categoria, confianca, vezes_usada, ativa
imovel_rendas, imovel_custo_regras  -- definidas, pouco usadas (renda lida de transactions)
```

### Categorias actuais (15)
`Receita, Groceries, Restauração, Compras, Saúde, Transportes, Lazer, Levantamentos, Habitação, Utilities, Subscrições, Investimentos, Comissões e Taxas, Transferências, Despesas Gerais`

### Views
`v_monthly_summary`, `v_category_breakdown`, `v_imovel_pnl`, `v_pending_review`, `v_imovel_por_associar`

### RLS
Admin vê tudo. `familiar` só vê contas/transacções com `budget_tag='familiar'` (políticas activas, UI não as usa ainda).

### Migrações aplicadas (ordem)
`schema-complete` → `01-iban` → `02-imoveis` → `03-valorizacao` → `04-zerar-saldos` → `05-saldo-data` → `06-categorias` → `07-habitacao-regras` → `08-groceries`

---

## 3. Estrutura de Ficheiros

```
finance-app/
├── .env.local                    # SUPABASE_URL/ANON_KEY, GEMINI_API_KEY
├── package.json                  # Next 15.3.3, React 18.3.1, recharts, lucide-react
├── tsconfig.json                 # target: es5 — atenção: for-of em Set/Map precisa Array.from()
├── src/
│   ├── app/
│   │   ├── page.tsx              # ~2290 linhas, TODA a UI (não modularizado)
│   │   ├── layout.tsx, globals.css
│   │   └── api/parse/route.ts    # Gemini parsing PDF→JSON
│   └── lib/supabase.ts           # client, types, funções de dados
└── public/manifest.json          # PWA
```

### `page.tsx` — mapa de componentes
- **Formatters:** `big`, `dec`, `sgn`, `compact`, `parseNum`, `fmtDate`
- **Data:** `computeView`, `latestMonthWithData`, `monthYearLabel`, `accountSaldo`
- **Charts:** `Spark` (hero), `DynChart`/`TrendTile` — eixo Y direito com `ReferenceLine` (não usar Fragment — recharts ignora), sem dots nas linhas
- **Forms:** `AccountForm`, `ImovelForm`, `TxnEditForm`
- **Screens:** `BudgetScreen`, `ImoveisScreen`, `PatrimonioScreen`, `AllTransactionsScreen`, `AllCategoriesScreen` (grid 2col), `RulesScreen` (bulk), `SettingsPanel`, `ImportWizard` (multi-ficheiro)

### `supabase.ts` — funções chave
CRUD accounts/transactions/imoveis/contaImovel · `loadCategoryRules`, `matchRule`, `learnFromCategorization`, `extractPattern`

### `api/parse/route.ts`
Modelo `gemini-2.5-flash-lite` (mudou de 1.5-flash→descontinuado, depois 2.5-flash→limite 20 pedidos/dia). Devolve `{transactions[], meta{saldo_final,iban,numero_conta,periodo_fim}, categoria sugerida}`.

---

## 4. Funcionalidades Completas

✅ Auth (Supabase, email/password)
✅ CRUD contas (IBAN, nº conta, saldo auto-calculado por extracto)
✅ CRUD transacções (editar, apagar, filtros, batch select/delete/recategorize)
✅ Import multi-ficheiro com preview, progress bar, erro diagnosticado
✅ Saldo/IBAN/nº conta extraídos automaticamente do PDF, só actualiza se mais recente
✅ Imóveis: CRUD, % ownership, ligação N:N a contas, valorização + toggle, fila "por associar"
✅ Património: agregação com toggle de valorização, quota por conta
✅ Categorização: regras aprendidas (prioridade) + sugestão Gemini (fallback) + correcção manual reforça regra
✅ Ecrã de gestão de regras (RulesScreen) com bulk actions
✅ Drill-down por categoria: clique filtra página (gráfico+lista); "Ver todas" → grid de categorias → transacções
✅ Gráficos: eixo Y compacto à direita, linhas de referência, estado vazio tratado
✅ Deploy Vercel + PWA instalável no iPhone
✅ Reset de saldo (individual/bulk) nas Definições

---

## 5. Decisões de Design Confirmadas (não reabrir sem motivo)

| Decisão | Resolução |
|---|---|
| Saldo da conta | Editável só na criação (saldo inicial); depois só via import, comparando `saldo_data` |
| Categorias | Lista plana de 15, sem subcategorias |
| Filtro categoria no gráfico | Clique na categoria filtra página inteira (não dropdown separado) |
| "Ver mais categorias" | Ecrã dedicado em grid 2 colunas, não lista longa nem vai direto a transacções |
| Aprendizagem de categorias | Regras SEMPRE prioritárias sobre sugestão Gemini; ambas (edição manual + import aceite) reforçam regras |
| Imóveis — ownership | 100% sempre na tab Imóveis; % só aplicada na tab Património |
| Open Banking | Adiado conscientemente — schema já preparado (`import_batches.source`) mas não a construir agora |

---

## 6. Pendências / Dívida Técnica Conhecida

- ⚠️ `page.tsx` com ~2290 linhas num único ficheiro — candidato a modularização se continuar a crescer
- ⚠️ Tabelas `imovel_rendas`/`imovel_custo_regras` órfãs (schema existe, pouco/nada usadas)
- ⚠️ Gemini `flash-lite` tem falhas de parsing aleatórias em alguns PDFs (causa não isolada) — decisão pendente entre subir para `flash` com billing vs melhorar prompt/retry
- ⚠️ RLS `familiar` pronto na BD mas UI não distingue/restringe ainda

---

## 7. Próximos Passos

### 🔜 Próximo (em discussão) — Google Drive
Objectivo: import mobile-friendly (picker Drive + paste de PDF copiado do email), com arquivo automático organizado por pastas.

**Plano em 5 passos:**
1. **OAuth Google** — Client ID/Secret no Google Cloud Console, scope `drive.file`, token por utilizador (tabela nova ou campo em `profiles`), botão "Ligar Drive" nas Definições
2. **Estrutura de pastas** — `Finance App/{tag}/{conta}/{ano}/`, decisão pendente: criar automaticamente vs apontar pastas existentes
3. **Picker da Drive** (via garantida) — Google Picker API embutida no `ImportWizard`, ficheiro escolhido segue para `/api/parse` como hoje
4. **Arquivo automático pós-import** — sobe o PDF original para a pasta certa via Drive API, guarda `google_file_id` em `import_batches` (campo já existe)
5. **Paste de PDF** (via exploratória, validar viabilidade mobile antes de prometer) — `onPaste` com `clipboardData.files`, fallback para o picker

**Riscos identificados:** consent screen Google pode exigir verificação (mitigável com modo "Testing"); paste de ficheiro é inconsistente entre browsers/SO; `drive.file` scope só vê ficheiros criados pela própria app (picker contorna isto).

### Depois do Drive
1. **Acesso Cici** — construir UI/fluxo para role `familiar` (RLS já pronto, falta condicionar tabs/navegação)
2. **Investigar falhas de parsing Gemini** — decidir entre billing (`flash`) ou melhorar prompt/retry em `flash-lite`
3. **Limpeza técnica** — remover ou activar `imovel_rendas`/`imovel_custo_regras`; avaliar modularizar `page.tsx`

---

## 8. Workflow de Desenvolvimento

- Claude gera ficheiros completos → ZIP via `present_files`
- Utilizador substitui ficheiros na pasta local `finance-app/`
- Commit + push via **GitHub Desktop** (Git CLI não está no PATH do PowerShell do utilizador)
- Vercel faz deploy automático no push para `main`
- SQL corrido manualmente no Supabase SQL Editor (sempre em "+ New query", nunca reaproveitar query antiga)
- Validação de sintaxe antes de empacotar: contagem de chavetas/parênteses balanceados via script Node
- Utilizador não testa localmente (sem `npm run dev` activo durante a maior parte do desenvolvimento recente) — testa directo em produção após deploy
