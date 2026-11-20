-- Promemoria push: ogni 5 minuti Supabase chiama l'app, che decide quali notifiche mandare.
-- Da eseguire nel SQL Editor DOPO il deploy su Vercel, sostituendo:
--   <DOMINIO>      il dominio dell'app su Vercel, es. cosamangio-xyz.vercel.app
--   <CRON_SECRET>  lo stesso valore di CRON_SECRET nelle variabili d'ambiente di Vercel
-- Il cron di Vercel sul piano gratuito gira una volta al giorno, per questo lo fa Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dieta-promemoria',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<DOMINIO>/api/push/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 20000
  );
  $$
);

-- Controllo delle ultime chiamate (status 200 = ok):
--   select status_code, content from net._http_response order by created desc limit 5;
-- Per spegnerlo:
--   select cron.unschedule('dieta-promemoria');
