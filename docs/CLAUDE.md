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
- Produção: finance-app-six-flax.vercel.app
- Supabase project ID: vgltihdbtslfyjoawqrl

## Arquitectura
- `src/app/page.tsx` — ficheiro único, ~3700 linhas. **Modularização pendente**,
  ver `docs/PROJECT_STATE.md` → Backlog técnico.
- `src/lib/`: `supabase.ts`, `geminiParse.ts`, `googleDrive.ts`, `enableBanking.ts`, `t212.ts`
- `src/app/api/cron/check-drive/route.ts` — cron diário (5h): Drive PDF + Enable Banking + T212
- UI em português (PT), tema escuro. Tokens de design no objecto `T`, paletas `PAL` por tab.

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

**Sem bug activo de momento.** Último resolvido: `ownership_pct` a 100% não
reflectia no ecrã (2026-08-06) — causa era edição no ecrã errado, não bug de
código. Ver PROJECT_STATE.md → "Bugs resolvidos (Saúde Financeira)".
