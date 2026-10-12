# Finance App

O contexto completo do projecto (stack, arquitectura, comandos, como trabalhar com o Filipe)
vive em `docs/CLAUDE.md` e é importado aqui para carregar automaticamente em cada sessão.

@docs/CLAUDE.md

## Ler explicitamente quando relevante (não é importado — tem ~1000 linhas)
- `docs/PROJECT_STATE.md` — funcionalidades feitas, bugs, roadmap, decisões e armadilhas conhecidas.
  Ler antes de mexer em RLS, sync de Drive/Excel, Enable Banking ou IRS.
- `docs/prds/` — PRDs de funcionalidades.

## Automação do projecto (`.claude/`)
- Hooks: `tsc --noEmit` após editar `.ts/.tsx`; bloqueio de edição a `.env*` e `package-lock.json`;
  `tsc` antes de `git push`.
- MCP `supabase` (`.mcp.json`): só leitura, limitado ao projecto da app.
- Subagente `security-reviewer`: auditoria de RLS, segredos e rotas de API.
