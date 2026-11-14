-- Carreira Realista ATS: tabelas de sincronização (Supabase / PostgreSQL)
-- Como usar: no painel do Supabase, abra SQL Editor, cole este arquivo inteiro e clique em Run.
-- Pode rodar mais de uma vez sem perder dados.

-- Estado da carreira: uma linha por usuário.
create table if not exists public.careers (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state      jsonb not null,
  rev        bigint not null default 0,          -- marca de tempo da última mudança (vale a mais recente)
  client     text,                               -- aparelho que gravou por último
  updated_at timestamptz not null default now()
);

-- Semanas fechadas (Histórico): uma linha por semana.
create table if not exists public.career_weeks (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_id    text not null,
  start_day  integer not null default 0,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id)
);

-- Limites de tamanho: impedem que alguém use o banco para guardar arquivos grandes.
alter table public.careers      drop constraint if exists careers_tamanho;
alter table public.careers      add  constraint careers_tamanho check (pg_column_size(state) < 2000000);
alter table public.career_weeks drop constraint if exists career_weeks_tamanho;
alter table public.career_weeks add  constraint career_weeks_tamanho check (pg_column_size(data) < 500000 and length(week_id) <= 64);

-- Cada usuário só enxerga e altera as próprias linhas (Row Level Security).
alter table public.careers      enable row level security;
alter table public.career_weeks enable row level security;

drop policy if exists "careers: dono" on public.careers;
create policy "careers: dono" on public.careers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "career_weeks: dono" on public.career_weeks;
create policy "career_weeks: dono" on public.career_weeks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Só quem está logado acessa; visitantes sem login não leem nem gravam nada.
revoke all on public.careers, public.career_weeks from anon;
revoke all on public.careers, public.career_weeks from authenticated;
grant select, insert, update, delete on public.careers, public.career_weeks to authenticated;
