-- Giorni di allenamento spostati dall'app. Da eseguire una volta nel SQL Editor del progetto Supabase.

-- I giorni delle sedute di una settimana (lunedi = il suo lunedì), se li hai spostati: senza riga valgono quelli
-- soliti di src/lib/allenamento.ts.
create table public.sedute_spostate (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lunedi date not null,
  giorni date[] not null,
  primary key (user_id, lunedi)
);

alter table public.sedute_spostate enable row level security;

create policy "solo le proprie sedute" on public.sedute_spostate
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
