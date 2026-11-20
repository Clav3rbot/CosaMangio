"use client";

import { useState } from "react";
import { Droplet } from "lucide-react";

// 8 bicchieri da 250 ml: i 2 litri al giorno del piano.
const BICCHIERI = 8;

// Il conto sta solo su questo telefono (localStorage): serve alla giornata, non è uno storico.
// Per vederlo su più dispositivi va spostato su Supabase, come i pasti.
function leggi(giorno: string) {
  try {
    return Number(localStorage.getItem(`acqua:${giorno}`)) || 0;
  } catch {
    return 0;
  }
}

/** Va montato con key={giorno}: il conto si legge una volta sola, all'apertura. */
export default function Acqua({ giorno }: { giorno: string }) {
  const [bevuti, setBevuti] = useState(() => leggi(giorno));

  const imposta = (n: number) => {
    setBevuti(n);
    try {
      localStorage.setItem(`acqua:${giorno}`, String(n));
    } catch {
      // senza memoria del browser resta il conto a schermo
    }
  };

  return (
    <section className="card mt-3 p-4" aria-label="Acqua">
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Droplet className="h-4 w-4 text-prot" /> Acqua
        </p>
        <p className="text-sm text-muted">{(bevuti * 0.25).toLocaleString("it-IT")} di 2 litri</p>
      </div>
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {Array.from({ length: BICCHIERI }, (_, k) => (
          <button
            key={k}
            type="button"
            aria-label={`${k + 1} ${k ? "bicchieri" : "bicchiere"}`}
            aria-pressed={k < bevuti}
            // Toccare l'ultimo bicchiere pieno lo toglie: così si corregge un tocco di troppo.
            onClick={() => imposta(bevuti === k + 1 ? k : k + 1)}
            className={`grid h-11 place-items-center rounded-2xl transition active:scale-95 ${
              k < bevuti ? "bg-prot text-accent-ink" : "bg-bg text-muted"
            }`}
          >
            <Droplet className="h-5 w-5" fill={k < bevuti ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </section>
  );
}
