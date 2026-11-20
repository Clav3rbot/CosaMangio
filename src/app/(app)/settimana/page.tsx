"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, PackageX } from "lucide-react";
import IconaPasto from "@/components/IconaPasto";
import Mese from "@/components/Mese";
import { ALLENAMENTO } from "@/lib/allenamento";
import { pastiCon, useAdesso, useManca, useSettimana, useSpesa } from "@/lib/dati";
import {
  INIZIO,
  aggiungiGiorni,
  dataBreve,
  giornoDelPiano,
  giorniDellaSettimana,
  indiceGiorno,
  lunediDi,
  mancantiDi,
  piano,
} from "@/lib/piano";

export default function Settimana() {
  const adesso = useAdesso();
  const [scarto, setScarto] = useState(0);
  const lunedi = adesso ? aggiungiGiorni(lunediDi(giornoDelPiano(adesso.data)), 7 * scarto) : null;
  const { dati, errore } = useSettimana(lunedi);
  const { stato: spesa } = useSpesa();
  const manca = useManca(spesa, adesso?.data ?? null);

  if (!lunedi || !adesso) return <div className="h-dvh" />;

  const giorni = giorniDellaSettimana(lunedi).map((d) => ({ data: d, pasti: pastiCon(d, dati, manca) }));
  const tutti = giorni.flatMap((g) => g.pasti);
  const fatti = tutti.filter((p) => p.fatto).length;

  return (
    <>
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-muted">
            {dataBreve(lunedi)} – {dataBreve(aggiungiGiorni(lunedi, 6))}
          </p>
          <h1 className="text-[32px] leading-tight font-bold tracking-tight">
            {lunedi === INIZIO ? "Prima settimana" : scarto === 0 ? "Questa settimana" : scarto === 1 ? "Prossima settimana" : scarto === -1 ? "Settimana scorsa" : "Settimana"}
          </h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setScarto(scarto - 1)} aria-label="Settimana prima" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setScarto(scarto + 1)} aria-label="Settimana dopo" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </header>

      {errore && (
        <p role="alert" className="mt-4 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a leggere i dati: {errore}
        </p>
      )}

      <section className={`mt-4 grid gap-3 ${ALLENAMENTO ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="card p-4">
          <p className="text-xs text-muted">Pasti seguiti</p>
          <p className="mt-1 text-2xl font-bold">
            {fatti}
            <span className="text-base font-medium text-muted">/{tutti.length}</span>
          </p>
        </div>
        {ALLENAMENTO && (
          <div className="card p-4">
            <p className="text-xs text-muted">Allenamenti</p>
            <p className="mt-1 text-2xl font-bold">
              {dati?.allenamenti.length ?? 0}
              <span className="text-base font-medium text-muted">/{ALLENAMENTO.giorni.length}</span>
            </p>
          </div>
        )}
      </section>

      <ul className="mt-4 space-y-3">
        {giorni.map((g) => {
          const nFatti = g.pasti.filter((p) => p.fatto).length;
          const eOggi = g.data === adesso.data;
          return (
            <li key={g.data} className={`card p-4 ${eOggi ? "ring-2 ring-accent" : ""}`}>
              <Link href={eOggi ? "/" : `/?d=${g.data}`} className="flex items-baseline justify-between">
                <span className="text-[17px] font-semibold">
                  {piano.settimana[indiceGiorno(g.data)].giorno}
                  <span className="ml-2 text-sm font-normal text-muted">{dataBreve(g.data)}</span>
                </span>
                <span className={`text-sm font-semibold ${nFatti === g.pasti.length ? "text-accent" : "text-muted"}`}>
                  {nFatti}/{g.pasti.length}
                </span>
              </Link>
              <ul className="mt-2 space-y-1">
                {g.pasti.map((p) => (
                  <li key={p.id}>
                    <Link href={`/pasto?d=${g.data}&p=${p.id}`} className="flex items-center gap-2.5 py-1 text-[15px]">
                      <IconaPasto id={p.id} className={`h-4 w-4 shrink-0 ${p.fatto ? "text-accent" : "text-muted"}`} />
                      <span className={`min-w-0 flex-1 truncate ${p.fatto ? "text-muted" : ""}`}>{p.ricetta.nome}</span>
                      {p.fatto ? (
                        <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={3} aria-label="mangiato" />
                      ) : mancantiDi(p.ricetta, manca).length ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-fat">
                          <PackageX className="h-4 w-4" /> manca
                        </span>
                      ) : (
                        p.opzioni.length > 1 && <span className="shrink-0 text-xs text-muted">{p.opzioni.length} ricette</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <h2 className="titolo-sezione">Il mese</h2>
      <Mese oggi={adesso.data} />
    </>
  );
}
