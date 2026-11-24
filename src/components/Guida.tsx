"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Timer, X } from "lucide-react";

export type PassoGuida = { titolo?: string; testo: string; timer?: { nome: string; secondi: number }[] };

type TimerAttivo = { chiave: string; nome: string; fine: number; suonato: boolean };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Fuori dal componente: in avvia() il lint scambierebbe Date.now() per codice di render.
const oraAttuale = () => Date.now();

// Un <audio> e non un AudioContext: sull'iPhone l'AudioContext tace col tasto silenzioso.
function wavAllarme() {
  const hz = 22050;
  const b = new Uint8Array(44 + 2 * hz);
  const v = new DataView(b.buffer);
  const scrivi = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  scrivi(0, "RIFF");
  v.setUint32(4, 36 + 2 * hz, true);
  scrivi(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, hz, true);
  v.setUint32(28, 2 * hz, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  scrivi(36, "data");
  v.setUint32(40, 2 * hz, true);
  for (let i = 0; i < hz; i++) {
    const t = i / hz;
    const bip = t < 0.15 || (t > 0.25 && t < 0.4);
    // Armoniche e saturazione: a 880 Hz l'altoparlante del telefono rende poco, tra 2 e 4 kHz molto.
    const w = 2 * Math.PI * 880 * t;
    const s = (Math.sin(w) + 0.7 * Math.sin(2 * w) + 0.5 * Math.sin(3 * w) + 0.35 * Math.sin(4 * w)) / 1.94;
    v.setInt16(44 + 2 * i, bip ? Math.round((31500 * Math.tanh(2 * s)) / Math.tanh(2)) : 0, true);
  }
  let bin = "";
  // A pezzi: Safari rifiuta chiamate con più di 65536 argomenti.
  for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
  return "data:audio/wav;base64," + btoa(bin);
}

// Una per titolo: mentre arrivano i dati la pagina può mostrare per un attimo un'altra ricetta.
const SALVATE = "dieta:guide";
const DURATA_SALVATA = 3 * 3600_000;
type Salvata = { riapri: string; i: number; timers: TimerAttivo[]; durate: Record<string, number>; quando: number };

function salvate(): Record<string, Salvata> {
  try {
    const tutte: Record<string, Salvata> = JSON.parse(localStorage.getItem(SALVATE) ?? "{}");
    return Object.fromEntries(Object.entries(tutte).filter(([, s]) => Date.now() - s.quando < DURATA_SALVATA));
  } catch {
    return {}; // navigazione privata o memoria bloccata
  }
}

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

/** riapri: la pagina che riapre questa guida se iOS chiude l'app mentre è aperta. */
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
  // -1 = schermata iniziale.
  const [i, setI] = useState(salvata?.i ?? (intro ? -1 : 0));
  // Orario di fine, non conto alla rovescia: iOS sospende la pagina in background.
  const [timers, setTimers] = useState<TimerAttivo[]>(salvata?.timers ?? []);
  const [ora, setOra] = useState(() => Date.now());
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

  const esci = (azione: () => void) => {
    try {
      localStorage.removeItem(SALVATE);
    } catch {
      // niente da togliere
    }
    azione();
  };

  // iOS rilascia il blocco dello schermo in background: va richiesto di nuovo al rientro.
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

  const unMinutoInPiu = (chiave: string) => {
    const adesso = oraAttuale();
    setOra(adesso);
    setTimers(timers.map((t) => (t.chiave === chiave ? { ...t, fine: Math.max(t.fine, adesso) + 60_000, suonato: false } : t)));
  };

  const vai = (n: number) => {
    setTimers(timers.filter((t) => !t.suonato));
    setI(n);
  };

  // Focus sul tasto principale: sulla X, Invio chiuderebbe la guida.
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
      // Esc o gesto indietro: come la X; il dialog si chiude nel cleanup.
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
