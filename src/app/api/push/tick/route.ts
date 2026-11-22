import { NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { giorniSedute } from "@/lib/allenamento";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviaNotifica } from "@/lib/push";
import { adessoNelFuso, aggiungiGiorni, lunediDi, usaPiano, type PastoId, type Profilo } from "@/lib/piano";
import { promemoriaDelGiorno, type Promemoria } from "@/lib/promemoria";
import { mancaDa } from "@/lib/scorte";

// Finestra più larga del giro del cron (5 min): un giro saltato non perde l'avviso; push_log evita i doppioni.
const FINESTRA_MINUTI = 15;

/** Dal cron (supabase/cron.sql). Prova: ?at=AAAA-MM-GGTHH:MM simula l'ora nel fuso del piano, ?dry=1 non invia. */
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

  // Senza riga, o se la tabella non si legge, vale il piano predefinito.
  const { data: righeProfili } = await sb.from("profili").select("user_id,piano,preferenze");
  const profili = new Map((righeProfili ?? []).map((r) => [r.user_id as string, r as Profilo]));

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
    let dovuti: Promemoria[];
    try {
      // usaPiano è globale: fino a "dovuti" niente await, o un'altra richiesta lo cambia.
      usaPiano(profili.get(uid)?.piano, profili.get(uid)?.preferenze);
      const scelte = new Map(pasti.data!.map((r) => [`${r.giorno}|${r.pasto}`, r.ricetta as string | null]));
      // Come nell'app, se i giorni spostati non si leggono valgono quelli soliti.
      const sedutaOggi =
        giorniSedute(lunedi, spostate.data?.giorni as string[] | undefined).includes(adesso.data) &&
        !allenamenti.data!.some((r) => r.giorno === adesso.data);
      const manca = mancaDa(
        Object.fromEntries(spesa.data!.map((r) => [r.prodotto as string, r.stato as string])),
        Object.fromEntries(scorte.data!.map((r) => [r.prodotto as string, { quantita: r.quantita, dal: r.dal }])),
        adesso.data
      );
      dovuti = promemoriaDelGiorno(
        adesso.data,
        (d: string, p: PastoId) => scelte.get(`${d}|${p}`),
        sedutaOggi,
        manca
      ).filter((p) => p.minuti <= adesso.minuti && adesso.minuti - p.minuti < FINESTRA_MINUTI);
    } catch (e) {
      // Dati scritti dall'utente: se i suoi rompono i conti, gli altri ricevono lo stesso gli avvisi.
      console.error("avvisi saltati per un utente:", (e as Error).message);
      continue;
    }

    for (const p of dovuti) {
      if (dry) {
        report.push({ utente: uid, chiave: p.chiave, titolo: p.titolo });
        continue;
      }
      const chiave = `${uid}:${adesso.data}:${p.chiave}`;
      const { error: doppione } = await sb.from("push_log").insert({ chiave });
      if (doppione) continue; // già mandata, o errore del DB: meglio saltare che ripetere
      const mie = iscrizioni
        .filter((s) => s.user_id === uid)
        .map((s) => ({ endpoint: s.endpoint as string, subscription: s.subscription as PushSubscription }));
      const inviate = await inviaNotifica(sb, mie, { title: p.titolo, body: p.testo, url: p.url, tag: p.chiave });
      report.push({ utente: uid, chiave: p.chiave, titolo: p.titolo, inviate });
    }
  }

  if (!dry) await sb.from("push_log").delete().lt("sent_at", new Date(Date.now() - 7 * 86400000).toISOString());

  return NextResponse.json({ adesso, report });
}
