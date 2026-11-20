"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronLeft, LogOut, Share } from "lucide-react";
import { ALLENAMENTO, giorniSedute } from "@/lib/allenamento";
import { chiavePasto, useAdesso, useManca, useSettimana, useSpesa } from "@/lib/dati";
import { lunediDi, piano } from "@/lib/piano";
import { promemoriaDelGiorno } from "@/lib/promemoria";
import { createClient } from "@/lib/supabase/client";

function chiaveVapid(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const hhmm = (minuti: number) => `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`;

type StatoNotifiche = "caricamento" | "non-supportate" | "da-installare" | "spente" | "negate" | "attive";

export default function Tu() {
  const router = useRouter();
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
                : `Ti avviso quando iniziare a cucinare, la sera per spostare carne e pesce in frigo${ALLENAMENTO ? " e nei giorni di allenamento" : ""}.`}
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
