-- Sostituti scelti. Da eseguire una volta nel SQL Editor del progetto Supabase, prima di pubblicare l'app che li
-- usa: l'app legge la colonna insieme ai pasti.

-- Prodotto che mancava -> prodotto usato al suo posto in quel pasto: le scorte scalano quello.
alter table public.pasti add column sostituti jsonb not null default '{}';
