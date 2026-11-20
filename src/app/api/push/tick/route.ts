import { NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { giorniSedute } from "@/lib/allenamento";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviaNotifica } from "@/lib/push";
import { adessoNelFuso, aggiungiGiorni, lunediDi, type PastoId } from "@/lib/piano";
import { promemoriaDelGiorno } from "@/lib/promemoria";
import { mancaDa } from "@/lib/scorte";

// Un promemoria parte se il suo orario è passato da meno di 15 minuti: il cron gira ogni 5,
// così un giro saltato non fa perdere la notifica. push_log impedisce i doppioni.
const FINESTRA_MINUTI = 15;

/**
 * POST /api/push/tick — chiamato ogni 5 minuti dal cron di Supabase (supabase/cron.sql).
 * Prova manuale: ?at=AAAA-MM-GGTHH:MM simula quell'ora nel fuso del piano, ?dry=1 elenca senza inviare.
 */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const url = new URL(request.url);
  const at = url.searchParams.get("at");
  const dry = url.searchParams.has("dry");
  const adesso = at
    ? { data: at.slice(0, 10), minuti: Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16)) }
    : adessoNelFuso();

  const sb = createAdminClient();
  const { data: iscrizioni, error } = await sb.from("push_subscriptions").select("endpoint,user_id,subscription");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const utenti = [...new Set(iscrizioni.map((s) => s.user_id as string))];
  const report: { utente: string; chiave: string; titolo: string; inviate?: number }[] = [];
  const domani = aggiungiGiorni(adesso.data, 1);

  for (const uid of utenti) {
    const lunedi = lunediDi(adesso.data);
    const [pasti, allenamenti, spesa, scorte, spostate] = await Promise.all([
      sb.from("pasti").select("giorno,pasto,ricetta").eq("user_id", uid).in("giorno", [adesso.data, domani]),
      sb.from("allenamenti").select("giorno").eq("user_id", uid).gte("giorno", lunedi),
      sb.from("spesa").select("prodotto,stato").eq("user_id", uid),
      sb.from("scorte").select("prodotto,quantita,dal").eq("user_id", uid),
      sb.from("sedute_spostate").select("giorni").eq("user_id", uid).eq("lunedi", lunedi).maybeSingle(),
    ]);
    const errore = pasti.error ?? allenamenti.error ?? spesa.error ?? scorte.error;
    if (errore) return NextResponse.json({ error: errore.message }, { status: 500 });
    const scelte = new Map(pasti.data!.map((r) => [`${r.giorno}|${r.pasto}`, r.ricetta as string | null]));
    // Come nell'app, se i giorni spostati non si leggono valgono quelli soliti.
    const sedutaOggi =
      giorniSedute(lunedi, spostate.data?.giorni as string[] | undefined).includes(adesso.data) &&
      !allenamenti.data!.some((r) => r.giorno === adesso.data);
    // Come nell'app: i pasti proposti sono quelli che puoi fare con quello che hai.
    const manca = mancaDa(
      Object.fromEntries(spesa.data!.map((r) => [r.prodotto as string, r.stato as string])),
      Object.fromEntries(scorte.data!.map((r) => [r.prodotto as string, { quantita: r.quantita, dal: r.dal }])),
      adesso.data
    );
    const dovuti = promemoriaDelGiorno(
      adesso.data,
      (d: string, p: PastoId) => scelte.get(`${d}|${p}`),
      sedutaOggi,
      manca
    ).filter((p) => p.minuti <= adesso.minuti && adesso.minuti - p.minuti < FINESTRA_MINUTI);

    for (const p of dovuti) {
      if (dry) {
        report.push({ utente: uid, chiave: p.chiave, titolo: p.titolo });
        continue;
      }
      const chiave = `${uid}:${adesso.data}:${p.chiave}`;
      const { error: doppione } = await sb.from("push_log").insert({ chiave });
      if (doppione) continue; // già mandata in un giro precedente (o errore del DB: meglio saltare che ripetere)
      const mie = iscrizioni
        .filter((s) => s.user_id === uid)
        .map((s) => ({ endpoint: s.endpoint as string, subscription: s.subscription as PushSubscription }));
      const inviate = await inviaNotifica(sb, mie, { title: p.titolo, body: p.testo, url: p.url, tag: p.chiave });
      report.push({ utente: uid, chiave: p.chiave, titolo: p.titolo, inviate });
    }
  }

  // Le righe di push_log più vecchie di una settimana non servono più.
  if (!dry) await sb.from("push_log").delete().lt("sent_at", new Date(Date.now() - 7 * 86400000).toISOString());

  return NextResponse.json({ adesso, report });
}
