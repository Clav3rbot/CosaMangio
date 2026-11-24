-- Il piano lo assegna solo chi amministra. Da eseguire nel SQL Editor di Supabase; si può rieseguire.
revoke insert, update, delete on public.profili from anon, authenticated;
grant insert (user_id, preferenze), update (user_id, preferenze) on public.profili to authenticated;
