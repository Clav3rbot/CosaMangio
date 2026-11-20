import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client con la chiave segreta, per il cron delle notifiche: arriva da Supabase senza sessione,
 * quindi nessuna policy RLS lo riconosce. Solo lato server e solo dopo aver controllato CRON_SECRET:
 * questa chiave scavalca ogni RLS.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante nelle variabili d'ambiente.");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
