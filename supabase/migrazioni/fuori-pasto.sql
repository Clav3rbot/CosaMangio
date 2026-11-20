-- Cibi mangiati fuori dai pasti del piano (banana, arancia, finocchio...): una riga per porzione. Contano nelle kcal
-- del giorno e scalano le scorte. Da eseguire una volta nel SQL Editor di Supabase, prima del deploy che li usa.
create table public.fuori_pasto (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  giorno date not null,
  cibo text not null,
  quando timestamptz not null default now()
);
create index fuori_pasto_giorno on public.fuori_pasto (user_id, giorno);

alter table public.fuori_pasto enable row level security;
create policy "solo i propri cibi" on public.fuori_pasto
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
