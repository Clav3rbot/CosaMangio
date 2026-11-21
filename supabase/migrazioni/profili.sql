-- Profilo di ogni utente: quale piano segue e le sue preferenze (orari dei pasti e degli avvisi, avvisi spenti).
-- Da eseguire nel SQL Editor PRIMA del deploy: senza la tabella tutti vedono il piano predefinito.
-- Prende il posto della variabile d'ambiente PIANI: per dare a un utente un piano di src/data/altri-piani.ts,
--   insert into public.profili (user_id, piano) values ('<id da Authentication -> Users>', '<nome>')
--   on conflict (user_id) do update set piano = excluded.piano;

create table public.profili (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  piano text not null default '',
  preferenze jsonb not null default '{}'
);

alter table public.profili enable row level security;

create policy "solo il proprio profilo" on public.profili
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
