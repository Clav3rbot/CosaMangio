"use client";

import { useState } from "react";

export type DatoBarra = {
  etichetta: string;
  titolo: string;
  /** null = giorno da venire. */
  valore: number | null;
  obiettivo: number;
  evidenzia?: boolean;
};

/** fascia: oltre il massimo la barra è rossa. pronto: false finché i valori non sono definitivi. */
export default function Barre({
  titolo,
  riepilogo,
  unita,
  barre,
  fascia,
  pronto = true,
}: {
  titolo: string;
  riepilogo: string;
  unita: string;
  barre: DatoBarra[];
  fascia?: [number, number];
  pronto?: boolean;
}) {
  const [attiva, setAttiva] = useState<number | null>(null);
  const massimo = Math.max(1, fascia?.[1] ?? 0, ...barre.map((b) => Math.max(b.obiettivo, b.valore ?? 0)));
  const alta = (n: number) => `${(n / massimo) * 100}%`;
  const scelta = attiva === null ? null : barre[attiva];

  return (
    <section className="card mt-3 p-4" aria-label={titolo}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{titolo}</p>
        <p className="min-h-5 text-sm text-muted" aria-live="polite">
          {!scelta
            ? pronto
              ? riepilogo
              : ""
            : scelta.valore === null
              ? `${scelta.titolo}: obiettivo ${scelta.obiettivo} ${unita}`
              : `${scelta.titolo}: ${scelta.valore} di ${scelta.obiettivo} ${unita}`}
        </p>
      </div>
      <div className="relative mt-4 grid h-36 grid-cols-7 gap-1">
        {fascia && (
          // Esclude le etichette: h-4 + gap-1.5.
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[22px]">
            <div
              className="fascia-entra absolute inset-x-0 border-y border-dashed"
              style={{
                bottom: alta(fascia[0]),
                height: alta(fascia[1] - fascia[0]),
                background: "color-mix(in srgb, var(--accent) 9%, transparent)",
                borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)",
                maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              }}
            />
          </div>
        )}
        {barre.map((b, i) => {
          const v = b.valore ?? 0;
          const soglia = fascia?.[1] ?? b.obiettivo;
          return (
            <button
              key={b.titolo}
              type="button"
              aria-pressed={attiva === i}
              aria-label={`${b.titolo}: ${b.valore === null ? "obiettivo" : `${b.valore} di`} ${b.obiettivo} ${unita}`}
              onClick={() => setAttiva(attiva === i ? null : i)}
              className="flex flex-col items-center gap-1.5 transition-opacity duration-150"
              style={{ opacity: attiva !== null && attiva !== i ? 0.3 : 1 }}
            >
              <span className="relative w-full flex-1">
                <span
                  className="absolute inset-x-0 bottom-0 mx-auto w-6 rounded-full"
                  style={{
                    height: alta(b.obiettivo),
                    background:
                      b.valore === null
                        ? "repeating-linear-gradient(-45deg, var(--line) 0 2px, transparent 2px 5px)"
                        : "var(--line)",
                  }}
                />
                {pronto && (
                  <span
                    className={`barra-cresce absolute inset-x-0 bottom-0 mx-auto w-6 overflow-hidden rounded-full transition-[height] duration-500 ${
                      b.evidenzia && v > 0 ? "barra-oggi" : ""
                    }`}
                    style={{
                      height: alta(v),
                      background:
                        v > soglia
                          ? `linear-gradient(to top, var(--accent) ${(soglia / v) * 100}%, var(--fat) ${(soglia / v) * 100}%)`
                          : "var(--accent)",
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                )}
              </span>
              <span className={`h-4 text-xs leading-4 ${b.evidenzia ? "font-semibold text-accent" : "text-muted"}`}>
                {b.etichetta}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
