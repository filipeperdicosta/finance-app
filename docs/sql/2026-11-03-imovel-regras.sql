-- Associação automática de transações a imóveis (regras aprendidas).
-- Correr no SQL Editor do Supabase. Verificação no fim.

create table if not exists public.imovel_regras (
  id              uuid primary key default gen_random_uuid(),
  imovel_id       uuid not null references public.imoveis(id) on delete cascade,
  pattern         text not null,                 -- descritivo normalizado (sem dígitos/pontuação)
  valor_ref       numeric not null,              -- último valor associado (acompanha a inflação)
  tol_pct         numeric not null default 5,    -- tolerância de valor, em %
  dia_tipico      int,                           -- opcional; null = critério do dia desligado
  dia_tol         int,                           -- janela em dias (só se dia_tipico preenchido)
  vezes_usada     int not null default 1,
  ativa           boolean not null default true,
  last_matched_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (imovel_id, pattern)
);

-- Marca das transacções associadas automaticamente (para mostrar e poder reverter)
alter table public.transactions add column if not exists imovel_auto boolean not null default false;

alter table public.imovel_regras enable row level security;

create policy imovel_regras_select on public.imovel_regras for select to authenticated
  using (exists (select 1 from public.imovel_users iu
                 where iu.imovel_id = imovel_regras.imovel_id and iu.user_id = auth.uid() and iu.status = 'active'));
create policy imovel_regras_insert on public.imovel_regras for insert to authenticated
  with check (exists (select 1 from public.imovel_users iu
                      where iu.imovel_id = imovel_regras.imovel_id and iu.user_id = auth.uid() and iu.status = 'active'));
create policy imovel_regras_update on public.imovel_regras for update to authenticated
  using (exists (select 1 from public.imovel_users iu
                 where iu.imovel_id = imovel_regras.imovel_id and iu.user_id = auth.uid() and iu.status = 'active'));
create policy imovel_regras_delete on public.imovel_regras for delete to authenticated
  using (exists (select 1 from public.imovel_users iu
                 where iu.imovel_id = imovel_regras.imovel_id and iu.user_id = auth.uid() and iu.status = 'active'));

revoke all on public.imovel_regras from anon;

-- Verificação: deve devolver a tabela, 4 políticas e a coluna imovel_auto
select (select count(*) from pg_policies where tablename = 'imovel_regras') as politicas,
       (select count(*) from information_schema.columns
         where table_name = 'transactions' and column_name = 'imovel_auto') as coluna_auto,
       (select count(*) from public.imovel_regras) as regras;
