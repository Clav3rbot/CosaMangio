// web-push 4 è solo ESM con export nominati; le chiavi VAPID passano come opzione a ogni invio.
import { sendNotification, type PushSubscription } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

// Le iscrizioni le scrive il browser: il server invia solo ai servizi push veri, mai a URL arbitrari (SSRF).
const SERVIZI_PUSH = ["web.push.apple.com", "fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com"];

export function endpointValido(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && SERVIZI_PUSH.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Manda la notifica a tutte le iscrizioni e cancella quelle che il browser ha revocato. Ritorna quante sono partite. */
export async function inviaNotifica(
  sb: SupabaseClient,
  iscrizioni: { endpoint: string; subscription: PushSubscription }[],
  messaggio: { title: string; body: string; url: string; tag?: string }
) {
  const vapidDetails = {
    subject: process.env.VAPID_SUBJECT ?? "mailto:dieta@example.com",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
  let inviate = 0;
  for (const s of iscrizioni) {
    if (!endpointValido(s.subscription.endpoint)) {
      console.error("iscrizione push scartata: endpoint non ammesso");
      continue;
    }
    try {
      // TTL 1 ora: un promemoria del pranzo arrivato a cena non serve più.
      await sendNotification(s.subscription, JSON.stringify(messaggio), { TTL: 3600, vapidDetails });
      inviate++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push fallita", status, (e as Error).message);
    }
  }
  return inviate;
}
