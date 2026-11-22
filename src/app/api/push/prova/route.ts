import { NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { createClient } from "@/lib/supabase/server";
import { inviaNotifica } from "@/lib/push";

/** Nessun filtro per utente: la RLS restituisce solo le iscrizioni di chi è collegato. */
export async function POST() {
  const sb = await createClient();
  const { data, error } = await sb.from("push_subscriptions").select("endpoint,subscription");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data.length) return NextResponse.json({ error: "Nessun dispositivo iscritto" }, { status: 400 });
  const inviate = await inviaNotifica(
    sb,
    data.map((s) => ({ endpoint: s.endpoint as string, subscription: s.subscription as PushSubscription })),
    { title: "Notifiche attive", body: "Ti avviso prima di ogni pasto e la sera per lo scongelamento.", url: "/" }
  );
  return NextResponse.json({ inviate });
}
