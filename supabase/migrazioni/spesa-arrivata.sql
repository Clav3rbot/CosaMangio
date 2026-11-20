-- Aggiunge lo stato 'da_congelare' alla spesa (bottone "Spesa arrivata").
-- Da eseguire una volta nel SQL Editor del progetto Supabase, se lo schema è stato creato prima di questa modifica.
alter table public.spesa drop constraint spesa_stato_check;
alter table public.spesa add constraint spesa_stato_check check (stato in ('preso', 'in_casa', 'da_congelare'));
