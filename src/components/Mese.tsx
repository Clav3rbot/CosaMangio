"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Anello from "@/components/Anello";
import { useMese } from "@/lib/dati";
import {
  dataLunga,
  giorniDelMese,
  giornoDelPiano,
  indiceGiorno,
  nomeMese,
  pastiDelGiorno,
  piano,
  spostaMese,
} from "@/lib/piano";

const LETTERE = ["L", "M", "M", "G", "V", "S", "D"];

/** Calendario del mese: per ogni giorno la quota di pasti fatti (anello, cerchio pieno se tutti) e l'allenamento (punto). */
export default function Mese({ oggi }: { oggi: string }) {
  const [mese, setMese] = useState(() => giornoDelPiano(oggi).slice(0, 7));
  const { dati, errore } = useMese(mese);
  const giorni = giorniDelMese(mese);
  // Si contano solo i giorni del piano già arrivati: prima di piano.inizio e nel futuro non c'è niente da seguire.
  const nelPiano = (d: string) => d >= piano.inizio && d <= oggi;
  const completo = (d: string) => nelPiano(d) && (dati?.fatti[d] ?? 0) >= pastiDelGiorno(d).length;
  const passati = giorni.filter(nelPiano);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold first-letter:uppercase">{nomeMese(mese)}</p>
          {passati.length > 0 && (
            <p className="text-sm text-muted">
              {passati.filter(completo).length} di {passati.length} giorni completi
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMese(spostaMese(mese, -1))}
            aria-label="Mese prima"
            className="grid h-11 w-11 place-items-center rounded-full border border-line"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMese(spostaMese(mese, 1))}
            aria-label="Mese dopo"
            className="grid h-11 w-11 place-items-center rounded-full border border-line"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {errore && (
        <p role="alert" className="mt-3 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a leggere il mese: {errore}
        </p>
      )}

      <div className="mt-3 grid grid-cols-7 justify-items-center gap-y-1.5">
        {LETTERE.map((l, n) => (
          <span key={n} className="text-xs text-muted">
            {l}
          </span>
        ))}
        {Array.from({ length: indiceGiorno(giorni[0]) }, (_, n) => (
          <span key={n} />
        ))}
        {giorni.map((d, k) => {
          const posto = indiceGiorno(giorni[0]) + k;
          const totale = pastiDelGiorno(d).length;
          const fatti = dati?.fatti[d] ?? 0;
          const numero = Number(d.slice(8));
          const pieno = completo(d);
          return (
            <Link
              key={d}
              href={d === oggi ? "/" : `/?d=${d}`}
              aria-current={d === oggi ? "date" : undefined}
              aria-label={`${dataLunga(d)}${nelPiano(d) ? `: ${fatti} pasti su ${totale}` : ""}${
                dati?.allenamenti.includes(d) ? ", allenamento fatto" : ""
              }`}
              className="cella-entra flex flex-col items-center gap-0.5"
              style={{ animationDelay: `${(posto % 7) * 30 + Math.floor(posto / 7) * 12}ms` }}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-full text-sm font-semibold ${
                  pieno ? "bg-accent text-accent-ink" : d === oggi ? "text-accent" : nelPiano(d) ? "text-ink" : "text-muted"
                } ${pieno && d === oggi ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""}`}
              >
                {nelPiano(d) && !pieno ? (
                  <Anello valore={fatti / totale} size={40} spessore={3}>
                    {numero}
                  </Anello>
                ) : (
                  numero
                )}
              </span>
              <span className={`h-1.5 w-1.5 rounded-full ${dati?.allenamenti.includes(d) ? "bg-fat" : ""}`} />
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        L&apos;anello è la quota di pasti fatti, il cerchio pieno un giorno completo
        {piano.allenamento ? ", il punto rosso l'allenamento" : ""}.
      </p>
    </section>
  );
}
