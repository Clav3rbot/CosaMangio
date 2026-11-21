"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronLeft, LogOut, Share } from "lucide-react";
import { giorniSedute } from "@/lib/allenamento";
import { chiavePasto, dimenticaDati, salvaPreferenze, useAdesso, useManca, useSettimana, useSpesa } from "@/lib/dati";
import { aggiungiGiorni, dataBreve, lunediDi, oraValida, piano, profiloLocale, usaProfilo, type Preferenze } from "@/lib/piano";
import { promemoriaDelGiorno } from "@/lib/promemoria";
import { createClient } from "@/lib/supabase/client";

function chiaveVapid(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const hhmm = (minuti: number) => `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`;

type StatoNotifiche = "caricamento" | "non-supportate" | "da-installare" | "spente" | "negate" | "attive";

const CAMPO = "rounded-2xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent";
// Gli orari che non sono di un pasto: la riga della tabella e il campo delle preferenze che la salva.
const AVVISI = { scongela: "scongela", allenamento: "allenamento", spesa: "ordina" } as const;

/** Le preferenze: orari dei pasti e degli avvisi (ognuno col suo interruttore), consegna della spesa e pausa.
 *  Un'ora si salva uscendo dal campo. "oggi" è null finché non si sa che giorno è. */
function Orari({ pref, oggi, onSalvate }: { pref: Preferenze; oggi: string | null; onSalvate: (p: Preferenze) => void }) {
  const [bozza, setBozza] = useState<Record<string, string>>({});
  // Le preferenze in corso di salvataggio: gli interruttori le mostrano subito, senza aspettare il database.
  const [inCorso, setInCorso] = useState<Preferenze | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [finoAl, setFinoAl] = useState("");
  const muti = (inCorso ?? pref).muti ?? [];
  const righe = [
    ...piano.pasti.map((p) => ({ chiave: p.id as string, nome: p.nome, ora: p.ora })),
    { chiave: "scongela", nome: "Cosa scongelare per domani", ora: piano.avvisi.scongela },
    ...(piano.allenamento ? [{ chiave: "allenamento", nome: "Allenamento", ora: piano.allenamento.ora }] : []),
    ...(piano.consegna ? [{ chiave: "spesa", nome: "Ordina la spesa (il giorno prima)", ora: piano.avvisi.ordina }] : []),
  ];
  // "orari" è quello che "Torna agli orari del piano" toglie: consegna e pause restano.
  const { consegna, pause = [], ...orari } = pref;
  // La pausa di adesso, se c'è: è sempre l'ultima, perché una nuova parte da oggi.
  const pausa = oggi && pause.findLast((p) => !p.al || p.al >= oggi);

  async function salva(nuove: Preferenze) {
    // Senza un orario suo, un pasto ha quello del piano: è quello che piano.pasti mostra adesso.
    const ore = piano.pasti.map((p) => nuove.orari?.[p.id] ?? p.ora);
    if (nuove.orari && ore.some((o, i) => i > 0 && ore[i - 1] >= o)) {
      setBozza({});
      return setErrore("I pasti devono restare in ordine di orario.");
    }
    setErrore(null);
    setInCorso(nuove);
    try {
      await salvaPreferenze(nuove);
      onSalvate(nuove);
    } catch (e) {
      setErrore(`Non sono riuscito a salvare: ${(e as Error).message}`);
    } finally {
      setBozza({});
      setInCorso(null);
    }
  }

  function esciDalCampo(chiave: string, prima: string) {
    const ora = bozza[chiave];
    // Campo svuotato o non toccato: resta l'ora di prima.
    if (!oraValida(ora) || ora === prima) return setBozza({});
    if (chiave === "consegna") salva({ ...pref, consegna: { ...pref.consegna!, ora } });
    else if (chiave in AVVISI) salva({ ...pref, [AVVISI[chiave as keyof typeof AVVISI]]: ora });
    else salva({ ...pref, orari: { ...pref.orari, [chiave]: ora } });
  }

  function mettiInPausa() {
    if (!oggi || (finoAl && finoAl < oggi)) return setErrore("La pausa finisce oggi o più avanti.");
    // Le pause vecchie restano (le ultime): servono al conto delle scorte.
    salva({ ...pref, pause: [...pause.slice(-9), finoAl ? { dal: oggi, al: finoAl } : { dal: oggi }] });
    setFinoAl("");
  }

  /** Da oggi il piano riparte: la pausa finisce ieri, o sparisce se era iniziata oggi. */
  function riprendi() {
    if (!oggi || !pausa) return;
    const ieri = aggiungiGiorni(oggi, -1);
    salva({ ...pref, pause: pause.flatMap((p) => (p !== pausa ? [p] : p.dal > ieri ? [] : [{ dal: p.dal, al: ieri }])) });
  }

  return (
    <>
      <h2 className="titolo-sezione">Orari e avvisi</h2>
      <section className="card px-5 pb-4">
        <ul className="divide-y divide-line">
          {righe.map((r) => (
            <li key={r.chiave} className="flex items-center gap-3 py-2.5">
              <label htmlFor={`ora-${r.chiave}`} className="min-w-0 flex-1 text-[15px] font-semibold">
                {r.nome}
              </label>
              <input
                id={`ora-${r.chiave}`}
                type="time"
                required
                value={bozza[r.chiave] ?? r.ora}
                onChange={(e) => setBozza({ ...bozza, [r.chiave]: e.target.value })}
                onBlur={() => esciDalCampo(r.chiave, r.ora)}
                className={CAMPO}
              />
              {/* "switch" è l'interruttore nativo di Safari (iPhone); altrove resta una casella di spunta. */}
              <input
                type="checkbox"
                {...({ switch: "" } as object)}
                aria-label={`Avviso: ${r.nome}`}
                checked={!muti.includes(r.chiave)}
                onChange={(e) =>
                  salva({ ...pref, muti: e.target.checked ? muti.filter((m) => m !== r.chiave) : [...muti, r.chiave] })
                }
                className="h-6 w-6 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              />
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-muted">
          L&apos;ora di un pasto vale in tutta l&apos;app: l&apos;avviso arriva a quell&apos;ora, o prima se il piatto va
          cucinato. L&apos;interruttore spegne solo il suo avviso.
        </p>
        {errore && (
          <p role="alert" className="mt-2 text-sm text-fat">
            {errore}
          </p>
        )}
        {Object.keys(orari).length > 0 && (
          <button
            type="button"
            onClick={() => salva({ ...(consegna && { consegna }), ...(pref.pause && { pause }) })}
            className="chip mt-3 font-medium"
          >
            Torna agli orari del piano
          </button>
        )}
      </section>

      <h2 className="titolo-sezione">Consegna della spesa</h2>
      <section className="card px-5 py-4">
        <div className="flex items-center gap-3">
          <label htmlFor="consegna-giorno" className="min-w-0 flex-1 text-[15px] font-semibold">
            Di solito arriva
          </label>
          <select
            id="consegna-giorno"
            value={(inCorso ?? pref).consegna?.giorno ?? ""}
            onChange={(e) =>
              salva(
                e.target.value === ""
                  ? { ...orari, ...(pref.pause && { pause }) }
                  : { ...pref, consegna: { giorno: Number(e.target.value), ora: consegna?.ora ?? "20:00" } }
              )
            }
            className={CAMPO}
          >
            <option value="">Non fisso</option>
            {piano.settimana.map((g, i) => (
              <option key={g.giorno} value={i}>
                {g.giorno}
              </option>
            ))}
          </select>
          {consegna && (
            <input
              type="time"
              required
              aria-label="Ora della consegna"
              value={bozza.consegna ?? consegna.ora}
              onChange={(e) => setBozza({ ...bozza, consegna: e.target.value })}
              onBlur={() => esciDalCampo("consegna", consegna.ora)}
              className={CAMPO}
            />
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Il giorno prima ti ricordo di ordinare, e in Spesa ti dico se quello che hai basta fino alla consegna.
        </p>
      </section>

      <h2 className="titolo-sezione">Pausa</h2>
      <section className="card px-5 py-4">
        {pausa ? (
          <>
            <p className="text-[15px] font-semibold">
              In pausa dal {dataBreve(pausa.dal)}
              {pausa.al ? ` al ${dataBreve(pausa.al)}` : ""}
            </p>
            <button type="button" onClick={riprendi} className="btn-primary mt-3 w-full">
              Riprendi da oggi
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <label htmlFor="pausa-al" className="min-w-0 flex-1 text-[15px] font-semibold">
                Fino al <span className="font-normal text-muted">(facoltativo)</span>
              </label>
              <input
                id="pausa-al"
                type="date"
                min={oggi ?? undefined}
                value={finoAl}
                onChange={(e) => setFinoAl(e.target.value)}
                className={CAMPO}
              />
            </div>
            <button type="button" onClick={mettiInPausa} disabled={!oggi} className="btn-ghost mt-3 w-full">
              Metti in pausa da oggi
            </button>
          </>
        )}
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Per le vacanze o i giorni fuori casa: niente avvisi, e le scorte scendono solo per quello che segni mangiato.
        </p>
      </section>
    </>
  );
}

export default function Tu() {
  const router = useRouter();
  const [pref, setPref] = useState<Preferenze>(() => profiloLocale()?.preferenze ?? {});
  const adesso = useAdesso();
  const { dati } = useSettimana(adesso ? lunediDi(adesso.data) : null);
  const { stato: spesa } = useSpesa();
  const manca = useManca(spesa, adesso?.data ?? null);
  const [stato, setStato] = useState<StatoNotifiche>("caricamento");
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // Su iPhone le notifiche esistono solo nell'app aggiunta alla Home.
      setTimeout(() => setStato(ios && !standalone ? "da-installare" : "non-supportate"), 0);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStato(Notification.permission === "denied" ? "negate" : sub ? "attive" : "spente"));
  }, []);

  async function attiva() {
    setOccupato(true);
    setMessaggio(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setStato("negate");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chiaveVapid(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      const sb = createClient();
      const { data } = await sb.auth.getSession();
      const { error } = await sb
        .from("push_subscriptions")
        .upsert({ endpoint: json.endpoint!, user_id: data.session?.user.id, subscription: json });
      if (error) throw new Error(error.message);
      setStato("attive");
    } catch (e) {
      setMessaggio(`Non sono riuscito ad attivarle: ${(e as Error).message}`);
    } finally {
      setOccupato(false);
    }
  }

  async function disattiva() {
    setOccupato(true);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setStato("spente");
    setOccupato(false);
  }

  async function prova() {
    setMessaggio(null);
    const res = await fetch("/api/push/prova", { method: "POST" });
    const body = await res.json();
    setMessaggio(res.ok ? "Notifica di prova inviata: arriva in qualche secondo." : `Prova fallita: ${body.error}`);
  }

  async function esci() {
    await createClient().auth.signOut();
    // Chi entra dopo da questo browser non parte col piano né coi dati di chi esce.
    usaProfilo(null);
    dimenticaDati();
    router.replace("/login");
    router.refresh();
  }

  const oggi = adesso
    ? promemoriaDelGiorno(
        adesso.data,
        (d, p) => dati?.pasti[chiavePasto(d, p)]?.ricetta,
        giorniSedute(lunediDi(adesso.data), dati?.spostate).includes(adesso.data) &&
          !dati?.allenamenti.includes(adesso.data),
        manca
      )
    : [];

  return (
    <>
      <header className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Torna a oggi"
          className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">Tu</h1>
      </header>

      <h2 className="titolo-sezione">Notifiche</h2>
      <section className="card p-5">
        {stato === "da-installare" && (
          <p className="flex items-start gap-2 text-[15px] leading-relaxed">
            <Share className="mt-1 h-4 w-4 shrink-0 text-accent" />
            Su iPhone le notifiche funzionano solo dall&apos;app sulla Home: in Safari tocca Condividi, poi
            &quot;Aggiungi alla schermata Home&quot;, e apri CosaMangio da lì.
          </p>
        )}
        {stato === "non-supportate" && <p className="text-[15px]">Questo browser non supporta le notifiche push.</p>}
        {stato === "negate" && (
          <p className="text-[15px] leading-relaxed">
            Le notifiche sono bloccate. Riattivale da Impostazioni → Notifiche → CosaMangio, poi torna qui.
          </p>
        )}
        {(stato === "spente" || stato === "attive") && (
          <>
            <p className="text-[15px] leading-relaxed">
              {stato === "attive"
                ? "Attive su questo dispositivo."
                : `Ti avviso quando iniziare a cucinare, la sera per spostare carne e pesce in frigo${piano.allenamento ? " e nei giorni di allenamento" : ""}.`}
            </p>
            <div className="mt-4 flex gap-2">
              {stato === "attive" ? (
                <>
                  <button type="button" onClick={prova} className="btn-primary flex-1">
                    <Bell className="h-5 w-5" /> Prova
                  </button>
                  <button type="button" onClick={disattiva} disabled={occupato} className="btn-ghost flex-1">
                    <BellOff className="h-5 w-5" /> Disattiva
                  </button>
                </>
              ) : (
                <button type="button" onClick={attiva} disabled={occupato} className="btn-primary w-full">
                  <Bell className="h-5 w-5" /> Attiva le notifiche
                </button>
              )}
            </div>
          </>
        )}
        {messaggio && <p className="mt-3 text-sm text-muted">{messaggio}</p>}
      </section>

      <Orari pref={pref} oggi={adesso?.data ?? null} onSalvate={setPref} />

      {oggi.length > 0 && (
        <>
          <h2 className="titolo-sezione">Gli avvisi di oggi</h2>
          <ul className="card divide-y divide-line px-5">
            {oggi.map((p) => (
              <li key={p.chiave} className="flex gap-4 py-3">
                <span className="w-12 shrink-0 font-semibold text-accent">{hhmm(p.minuti)}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{p.titolo}</span>
                  <span className="block text-sm text-muted">{p.testo}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="titolo-sezione">Come usare il piano</h2>
      <div className="card divide-y divide-line px-5">
        {piano.note.map((n) => (
          <details key={n.titolo} className="group py-3">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">
              {n.titolo}
              <span className="float-right text-muted transition group-open:rotate-90">›</span>
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{n.testo}</p>
          </details>
        ))}
      </div>

      <button type="button" onClick={esci} className="btn-ghost mt-6 w-full">
        <LogOut className="h-5 w-5" /> Esci
      </button>
    </>
  );
}
