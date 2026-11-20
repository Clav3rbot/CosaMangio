-- Scorte di casa e nomi del documento di consegna. Da eseguire una volta nel SQL Editor del progetto Supabase,
-- se lo schema è stato creato prima di questa modifica. Si può rieseguire: rifà solo il vincolo degli stati.

-- Stati della spesa: 'manca' (non consegnato) se non hai ancora eseguito non-arrivato.sql.
alter table public.spesa drop constraint spesa_stato_check;
alter table public.spesa add constraint spesa_stato_check
  check (stato in ('preso', 'in_casa', 'da_congelare', 'manca'));

-- Quanto hai in casa di un prodotto (grammi, o pezzi per uova, piadine e birra) al momento "dal": l'app toglie quello
-- che i pasti del piano usano da allora.
create table if not exists public.scorte (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prodotto text not null,
  quantita real not null check (quantita >= 0),
  dal timestamptz not null default now(),
  primary key (user_id, prodotto)
);

-- Codice articolo Esselunga -> prodotto della lista, scelto dall'utente ('' = non è nella lista), e quanto c'è in
-- una confezione se l'ha scritto (il documento di consegna non lo dice per tutto).
create table if not exists public.nomi_scontrino (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  codice text not null,
  prodotto text not null,
  grammi real,
  primary key (user_id, codice)
);
alter table public.nomi_scontrino add column if not exists grammi real;

alter table public.scorte enable row level security;
alter table public.nomi_scontrino enable row level security;
drop policy if exists "solo le proprie scorte" on public.scorte;
create policy "solo le proprie scorte" on public.scorte
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "solo i propri nomi" on public.nomi_scontrino;
create policy "solo i propri nomi" on public.nomi_scontrino
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
