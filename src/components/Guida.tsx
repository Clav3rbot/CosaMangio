"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Timer, X } from "lucide-react";

/** timer: quelli che il passo propone (anche più di uno: "8 minuti in padella, pasta per 10 minuti"), secondi compresi. */
export type PassoGuida = { titolo?: string; testo: string; timer?: { nome: string; secondi: number }[] };

type TimerAttivo = { chiave: string; nome: string; fine: number; suonato: boolean };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Fuori dal componente: avvia() gira solo al tocco, ma il lint non lo vede dentro un .map e lo prende per render.
const oraAttuale = () => Date.now();

// Un secondo di suono (due bip e una pausa) da ripetere finché non premi OK. Un <audio> e non un AudioContext:
// sull'iPhone l'AudioContext tace col tasto silenzioso, l'elemento audio no.
function wavAllarme() {
  const hz = 8000;
  const b = new Uint8Array(44 + hz);
  const v = new DataView(b.buffer);
  const scrivi = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  scrivi(0, "RIFF");
  v.setUint32(4, 36 + hz, true);
  scrivi(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, hz, true);
  v.setUint32(28, hz, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  scrivi(36, "data");
  v.setUint32(40, hz, true);
  for (let i = 0; i < hz; i++) {
    const t = i / hz;
    const bip = t < 0.15 || (t > 0.25 && t < 0.4);
    b[44 + i] = 128 + (bip ? Math.round(120 * Math.sin(2 * Math.PI * 880 * t)) : 0);
  }
  return "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
}

// Passo e timer stanno sul telefono: se iOS chiude l'app in background (telefono bloccato), al rientro la guida
// riparte da lì. Una per titolo: mentre i dati arrivano la pagina può mostrare per un attimo un'altra ricetta.
const SALVATE = "dieta:guide";
// Una guida lasciata lì da più di 3 ore non è più quella in corso.
const DURATA_SALVATA = 3 * 3600_000;
type Salvata = { riapri: string; i: number; timers: TimerAttivo[]; durate: Record<string, number>; quando: number };

function salvate(): Record<string, Salvata> {
  try {
    const tutte: Record<string, Salvata> = JSON.parse(localStorage.getItem(SALVATE) ?? "{}");
    return Object.fromEntries(Object.entries(tutte).filter(([, s]) => Date.now() - s.quando < DURATA_SALVATA));
  } catch {
    return {}; // navigazione privata o memoria bloccata: la guida non si ricorda
  }
}

/** La pagina della guida rimasta aperta, se c'è: l'app ci torna quando iOS la riapre da capo. */
export function guidaDaRiaprire() {
  return Object.values(salvate()).sort((a, b) => b.quando - a.quando)[0]?.riapri ?? null;
}

let allarme: HTMLAudioElement | null = null;

// iOS fa suonare più tardi solo un audio partito una volta da un tocco: lo avviamo muto all'avvio del timer.
function sbloccaAllarme() {
  if (!allarme) {
    allarme = new Audio(wavAllarme());
    allarme.loop = true;
  }
  if (!allarme.paused) return;
  const a = allarme;
  a.muted = true;
  a.play()
    .then(() => {
      a.pause();
      a.muted = false;
    })
    .catch(() => (a.muted = false));
}

/** Modalità passo-passo a tutto schermo: testo grande, schermo sempre acceso, più timer insieme.
 *  riapri = la pagina che riapre questa guida, se l'app viene chiusa mentre è aperta.
 *  ingredienti = tendina in cima a ogni passo, per pesare quello che non hai preparato prima. */
export default function Guida({
  titolo,
  riapri,
  passi,
  intro,
  ingredienti,
  etichettaFine,
  onFine,
  onChiudi,
}: {
  titolo: string;
  riapri: string;
  passi: PassoGuida[];
  intro?: React.ReactNode;
  ingredienti?: React.ReactNode;
  etichettaFine: string;
  onFine: () => void;
  onChiudi: () => void;
}) {
  const [salvata] = useState(() => {
    const s = salvate()[titolo];
    return s?.riapri === riapri ? s : null;
  });
  // -1 = schermata iniziale (ingredienti), se c'è.
  const [i, setI] = useState(salvata?.i ?? (intro ? -1 : 0));
  // Ogni timer misura su un orario di fine: se iOS sospende la pagina, al rientro il conto è giusto.
  const [timers, setTimers] = useState<TimerAttivo[]>(salvata?.timers ?? []);
  const [ora, setOra] = useState(() => Date.now());
  // Le durate cambiate con − e + prima di avviare, per chiave del timer.
  const [durate, setDurate] = useState<Record<string, number>>(salvata?.durate ?? {});
  // Timer ripresi dopo una chiusura: iOS li fa suonare solo dopo un tocco sullo schermo.
  const [muto, setMuto] = useState(!!salvata?.timers.length);

  useEffect(() => {
    try {
      localStorage.setItem(SALVATE, JSON.stringify({ ...salvate(), [titolo]: { riapri, i, timers, durate, quando: Date.now() } }));
    } catch {
      // senza memoria del browser la guida resta solo a schermo
    }
  }, [riapri, titolo, i, timers, durate]);

  // Chiudendo o finendo la guida non c'è più niente da riaprire.
  const esci = (azione: () => void) => {
    try {
      localStorage.removeItem(SALVATE);
    } catch {
      // niente da togliere
    }
    azione();
  };

  // Schermo acceso finché la guida è aperta (iOS lo riattiva al rientro solo se lo richiediamo di nuovo).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const richiedi = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
      }
    };
    richiedi();
    document.addEventListener("visibilitychange", richiedi);
    return () => {
      document.removeEventListener("visibilitychange", richiedi);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!timers.some((t) => !t.suonato)) return;
    const id = setInterval(() => {
      const adesso = Date.now();
      setOra(adesso);
      if (timers.some((t) => !t.suonato && adesso >= t.fine)) {
        navigator.vibrate?.([300, 150, 300]);
        setTimers(timers.map((t) => (adesso >= t.fine ? { ...t, suonato: true } : t)));
      }
    }, 250);
    return () => clearInterval(id);
  }, [timers]);

  // Suona in continuo finché c'è un timer scaduto e non ancora chiuso con OK.
  useEffect(() => {
    if (!allarme) return;
    // muted: è lo sblocco appena partito dal tocco, che si mette in pausa da solo.
    if (!timers.some((t) => t.suonato)) {
      if (!allarme.muted) allarme.pause();
    } else if (allarme.paused) allarme.play().catch(() => {});
  }, [timers]);
  useEffect(() => () => allarme?.pause(), []);

  const avvia = (chiave: string, nome: string, secondi: number) => {
    sbloccaAllarme();
    const adesso = oraAttuale();
    setOra(adesso);
    setTimers([...timers, { chiave, nome, fine: adesso + secondi * 1000, suonato: false }]);
  };

  // Un minuto in più anche a timer partito o già scaduto (la pasta non è ancora pronta).
  const unMinutoInPiu = (chiave: string) => {
    const adesso = oraAttuale();
    setOra(adesso);
    setTimers(timers.map((t) => (t.chiave === chiave ? { ...t, fine: Math.max(t.fine, adesso) + 60_000, suonato: false } : t)));
  };

  // Cambiando passo spariscono i timer già scaduti; quelli in corso restano a schermo.
  const vai = (n: number) => {
    setTimers(timers.filter((t) => !t.suonato));
    setI(n);
  };

  // <dialog> modale: la pagina sotto diventa inerte (tastiera e VoiceOver restano nella guida). Il focus va sul
  // tasto principale, non sulla X che con Invio chiuderebbe la guida.
  const finestra = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = finestra.current;
    if (!d) return;
    d.showModal();
    d.querySelector<HTMLElement>(".btn-primary")?.focus();
    return () => d.close();
  }, []);

  const passo = i >= 0 ? passi[i] : null;
  const ultimo = i === passi.length - 1;

  return (
    <dialog
      ref={finestra}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none flex-col border-0 bg-bg p-0 text-ink open:flex"
      aria-label={titolo}
      // Esc (o il gesto indietro): come la X. La pagina smonta la guida, che si chiude nel cleanup.
      onCancel={(e) => {
        e.preventDefault();
        esci(onChiudi);
      }}
      onPointerUp={
        muto
          ? () => {
              sbloccaAllarme();
              setMuto(false);
            }
          : undefined
      }
    >
      <div className="pt-safe mx-auto flex w-full max-w-md items-center justify-between px-4 pb-2">
        <button type="button" onClick={() => esci(onChiudi)} aria-label="Chiudi" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card">
          <X className="h-5 w-5" />
        </button>
        <p className="truncate px-3 text-sm font-medium text-muted">{titolo}</p>
        <p className="w-11 text-right text-sm font-semibold text-muted">
          {i >= 0 ? `${i + 1}/${passi.length}` : ""}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-md gap-1 px-4">
        {passi.map((_, n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 py-6">
        {passo ? (
          <>
            {ingredienti && (
              <details className="group mb-5">
                <summary className="card flex cursor-pointer list-none items-center justify-between px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                  Ingredienti
                  <ChevronDown className="h-5 w-5 text-muted transition group-open:rotate-180" />
                </summary>
                <div className="mt-2">{ingredienti}</div>
              </details>
            )}
            {passo.titolo && <p className="text-sm font-semibold text-accent">{passo.titolo}</p>}
            <p className="mt-2 text-[26px] leading-snug font-semibold">{passo.testo}</p>
            <div className="mt-6 space-y-2">
              {passo.timer?.map((t, n) => {
                const chiave = `${i}-${n}`;
                if (timers.some((x) => x.chiave === chiave)) return null;
                const secondi = durate[chiave] ?? t.secondi;
                // Passi da un minuto, da 10 secondi per i timer brevi dell'allenamento.
                const passoDurata = t.secondi >= 120 ? 60 : 10;
                const cambia = (s: number) => setDurate({ ...durate, [chiave]: s });
                return (
                  <div key={chiave} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cambia(secondi - passoDurata)}
                      disabled={secondi <= passoDurata}
                      aria-label={`${t.nome}: meno tempo`}
                      className="btn-ghost w-12 shrink-0 px-0"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => avvia(chiave, t.nome, secondi)} className="btn-ghost min-w-0 flex-1 px-3">
                      <Timer className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 text-left leading-tight">{t.nome}</span>
                      <span className="tabular-nums">{mmss(secondi)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cambia(secondi + passoDurata)}
                      aria-label={`${t.nome}: più tempo`}
                      className="btn-ghost w-12 shrink-0 px-0"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          intro
        )}

        {muto && timers.some((t) => !t.suonato) && (
          <p className="mt-6 text-sm text-muted">Tocca lo schermo per riattivare il suono dei timer.</p>
        )}
        {timers.length > 0 && (
          <ul className="mt-6 space-y-2" aria-live="polite">
            {timers.map((t) => {
              const restanti = Math.max(0, Math.ceil((t.fine - ora) / 1000));
              const scaduto = t.suonato || restanti === 0;
              return (
                <li
                  key={t.chiave}
                  role="timer"
                  className={`card flex items-center justify-between gap-3 px-5 py-4 ${scaduto ? "bg-accent text-accent-ink" : ""}`}
                >
                  <div className="min-w-0">
                    <p className={`truncate text-sm ${scaduto ? "" : "text-muted"}`}>
                      {scaduto ? `Tempo scaduto · ${t.nome}` : t.nome}
                    </p>
                    <p className="text-4xl font-bold">{mmss(restanti)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => unMinutoInPiu(t.chiave)}
                      aria-label={`${t.nome}: un minuto in più`}
                      className={`btn-ghost px-3 ${scaduto ? "text-ink" : ""}`}
                    >
                      +1′
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimers(timers.filter((x) => x.chiave !== t.chiave))}
                      className={scaduto ? "btn-ghost text-ink" : "btn-ghost"}
                    >
                      {scaduto ? "OK" : "Ferma"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="mx-auto flex w-full max-w-md gap-3 px-4 pt-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => vai(i - 1)}
          disabled={i <= (intro ? -1 : 0)}
          aria-label="Passo precedente"
          className="btn-ghost w-16 px-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {ultimo ? (
          <button type="button" onClick={() => esci(onFine)} className="btn-primary flex-1">
            {etichettaFine}
          </button>
        ) : (
          <button type="button" onClick={() => vai(i + 1)} className="btn-primary flex-1">
            {i < 0 ? "Inizia" : "Avanti"} <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </dialog>
  );
}
