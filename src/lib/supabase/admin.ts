import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Per il cron, senza sessione. Scavalca ogni RLS: solo lato server e solo dopo aver controllato CRON_SECRET. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante nelle variabili d'ambiente.");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
