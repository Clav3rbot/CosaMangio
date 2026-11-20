import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Id dell'utente per riempire `user_id` negli insert.
 * Legge la sessione già in memoria invece di interrogare l'Auth server come
 * fa getUser(): risparmia un round-trip prima di ogni salvataggio. Il valore
 * non deve essere "fidato" a livello di sicurezza, ma non serve che lo sia:
 * la policy RLS `with check (auth.uid() = user_id)` rifiuta comunque una riga
 * con un id diverso da quello del JWT.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}
