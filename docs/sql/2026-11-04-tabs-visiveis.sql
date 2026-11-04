-- Separadores visíveis/ordenados por utilizador (Definições › Separadores).
-- Correr no SQL Editor do Supabase. Verificação no fim.
-- null = comportamento por defeito (os 4 separadores, ordem original).

alter table public.profiles add column if not exists tabs_ordem   text[];
alter table public.profiles add column if not exists tabs_ocultos text[];

-- Verificação: deve devolver 2 colunas
select count(*) as colunas
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('tabs_ordem', 'tabs_ocultos');
