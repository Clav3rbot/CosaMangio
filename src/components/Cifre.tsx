"use client";

import { useEffect, useState } from "react";

export default function Cifre({ valore }: { valore: number }) {
  const ora = Math.round(valore);
  const [stato, setStato] = useState({ ora, prima: ora });
  // Nel primo secondo arrivano i dati: niente movimento.
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPronto(true), 1000);
    return () => clearTimeout(t);
  }, []);
  if (stato.ora !== ora) setStato({ ora, prima: pronto ? stato.ora : ora });
  const testo = String(ora);
  const vecchio = String(stato.prima);
  const verso = ora >= stato.prima ? 1 : -1;

  return (
    <span className="inline-flex">
      <span className="sr-only">{testo}</span>
      <span aria-hidden className="inline-flex">
        {[...testo].map((c, i) => {
          // Da destra: le unità restano unità.
          const posto = testo.length - i;
          const primaQui = vecchio[vecchio.length - posto];
          const cambia = stato.prima !== ora && primaQui !== c;
          return (
            <span key={posto} className="cifra" style={{ "--verso": verso } as React.CSSProperties}>
              {cambia && primaQui !== undefined && (
                <span key={`via-${stato.prima}`} className="cifra-esce">
                  {primaQui}
                </span>
              )}
              <span key={cambia ? ora : "ferma"} className={cambia ? "cifra-entra" : undefined}>
                {c}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
