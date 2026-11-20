-- Ingredienti non mangiati. Da eseguire una volta nel SQL Editor del progetto Supabase, prima di pubblicare l'app
-- che li usa: l'app legge la colonna insieme ai pasti.

-- Nomi degli ingredienti del pasto che non hai mangiato: escono da kcal, proteine e consumo delle scorte.
alter table public.pasti add column saltati text[] not null default '{}';
