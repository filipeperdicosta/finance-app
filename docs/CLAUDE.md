# Finance App — Contexto do Projecto

## O que é
App de finanças pessoais para o Filipe + Cici (multi-user). Agrega contas
bancárias (PSD2 + PDF), investimentos, imóveis e património num dashboard único.

## Stack
- Next.js 15, React 18, TypeScript
- Supabase (Postgres + RLS + RPCs `SECURITY DEFINER`)
- Gemini AI (gemini-2.5-flash-lite) — parsing de extractos PDF
- Google Drive OAuth (leitura), Enable Banking PSD2, Trading 212 API
- Deploy: Vercel, auto-deploy ao fazer `git push` para `main`

## URLs
- Produção: biofinance-alpha.vercel.app (renomeado de finance-app-six-flax.vercel.app,
  2026-08-13 — `bio-alpha`/`bio-beta`/`bio` já estavam ocupados por outra conta Vercel)
- Supabase project ID: vgltihdbtslfyjoawqrl

## Arquitectura
- `src/app/page.tsx` — ficheiro único, ~3700 linhas. **Modularização pendente**,
  ver `docs/PROJECT_STATE.md` → Backlog técnico.
- `src/lib/`: `supabase.ts`, `geminiParse.ts`, `googleDrive.ts`, `enableBanking.ts`, `t212.ts`,
  `irs.ts` (lógica IRS + mapeamento Ledger, partilhada cliente/servidor), `ledgerSync.ts`
  (sync Excel IRS), `custosCasaSync.ts` (sync Excel custos casa)
- `src/app/api/cron/check-drive/route.ts` — cron diário (5h): Drive PDF + Enable Banking + T212
  + LedgerAuto + Custos Casa
- UI em português (PT), tema escuro (grafite quente `#14110F` desde 2026-08-30).
  Tokens de design no objecto `T`, paletas `PAL` por tab. Fontes via
  `next/font/google`: Fraunces (marca "Bio."), Hanken Grotesk (UI/corpo),
  JetBrains Mono (valores monetários). Ícones de categoria em `lucide-react`
  (`CAT_META` → componente, render por `CatIcon`).

## Comandos úteis
- `npm run dev` — servidor local
- `npm run build` — **corre sempre antes de dar push**, apanha erros de TypeScript
  que só apareceriam no build do Vercel (poupa ciclos de ida-e-volta)
- Migrações de BD: correr SQL manualmente no editor do Supabase (sem tooling de
  migração local) — sempre com query de verificação depois

## Como trabalhar comigo
- Antes de alterações visuais, analisar e validar primeiro (mockup quando envolver gráficos)
- Explica o raciocínio antes do código — quero perceber o "porquê", não só a solução
- Correcções com precisão cirúrgica — evita reescrever código que já funciona
- Ao resolver um bug: confirma a causa raiz (com evidência, não suposição) antes do fix
- Para decisões de arquitectura com trade-offs: apresenta opções + a tua recomendação,
  não decidas sozinho
- Tom directo, caloroso, sem rodeios desnecessários

## Estado e histórico completo
Consulta `docs/PROJECT_STATE.md` para: funcionalidades já feitas, bugs em aberto,
roadmap acordado, decisões técnicas e aprendizagens/armadilhas conhecidas.

**Sem bug activo de momento.** Último resolvido: religar um banco no Enable
Banking criava uma conta duplicada "sem conta associada" porque o
`account_uid` muda a cada religação — agora casa por IBAN (2026-08-26).
Trabalho mais recente (2026-08-30): refresh visual "Opção A" (tipografia
Fraunces/Hanken/JetBrains Mono, paleta grafite quente, Hero sem gradiente,
ícones `lucide-react`) e exportação do mapeamento IRS Anexo F para
PDF/imagem/texto. Ver PROJECT_STATE.md.
