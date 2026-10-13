-- Endurecimento de segurança da BD (auditoria de 2026-10-13).
-- JÁ APLICADO no SQL Editor do Supabase (projecto vgltihdbtslfyjoawqrl). Fica aqui como registo.
-- Os scripts são idempotentes (excepto os revoke/grant, que são seguros de repetir).

-- 1. find_user_by_email: exige sessão (antes o anon podia enumerar emails/ids de auth.users)
create or replace function public.find_user_by_email(p_email text)
returns table(id uuid, email text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  return query select u.id, u.email::text from auth.users u
    where lower(u.email) = lower(trim(p_email)) limit 1;
end $$;

-- 2. Funções só para autenticados e service_role (o anon deixa de as poder chamar)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;
-- ARMADILHA: o default privileges acima não bastou — cada função NOVA criada no SQL Editor
-- fica com EXECUTE para PUBLIC. Fazer sempre: revoke execute on function public.<fn>(...) from public, anon;

alter function public.fn_get_role() set search_path = public;

-- 3. Políticas demasiado abertas (o cliente usa as RPCs create_account / accept_invite, SECURITY DEFINER)
drop policy if exists au_insert on public.account_users;       -- qualquer utilizador podia auto-inserir-se em qualquer conta
drop policy if exists accounts_insert on public.accounts;      -- WITH CHECK (true): até o anon criava linhas

-- 4. Ninguém altera o próprio role pelo cliente (profiles_update_own não restringia colunas)
create or replace function public.fn_protect_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated','anon') then
    raise exception 'role não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile_role on public.profiles;
create trigger trg_protect_profile_role before update on public.profiles
  for each row execute function public.fn_protect_profile_role();
revoke execute on function public.fn_protect_profile_role() from public, anon;

-- 5. Tokens do Google ilegíveis pelo browser (só o servidor, com service role, os lê)
revoke select, insert, update on public.google_drive_tokens from authenticated;
grant select (id, user_id, account_email, connected_at, expires_at)
  on public.google_drive_tokens to authenticated;

-- 6. anon sem acesso às tabelas; authenticated sem privilégios desnecessários
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- 7. Vistas ignoram a RLS por defeito (correm como o dono). Com security_invoker respeitam-na.
alter view public.v_category_breakdown set (security_invoker = true);
alter view public.v_monthly_summary set (security_invoker = true);
alter view public.v_pending_review set (security_invoker = true);
alter view public.v_imovel_por_associar set (security_invoker = true);
-- ARMADILHA: qualquer vista nova precisa de "with (security_invoker = true)".

-- Fora do SQL: Authentication › Sign In / Providers › "Allow new users to sign up" DESLIGADO.
-- Para adicionar alguém: ligar o registo uns minutos (ou criar o utilizador no Dashboard).
