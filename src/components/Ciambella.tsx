"use client";

import { useId, useState } from "react";
import Cifre from "@/components/Cifre";

export type Fetta = { nome: string; valore: number; spenta?: boolean };

const SIZE = 112;
const C = SIZE / 2;
const R = 44;
const SPESSORE = 14;
// In frazione del giro.
const STACCO = 0.008;
const COLORI = [
  "var(--accent)",
  "var(--prot)",
  "var(--carb)",
  "var(--fat)",
  "color-mix(in srgb, var(--accent) 50%, var(--card))",
  "color-mix(in srgb, var(--muted) 60%, var(--card))",
];
const MASSIMO = 5;

export default function Ciambella({ fette, unita }: { fette: Fetta[]; unita: string }) {
  const [scelta, setScelta] = useState<number | null>(null);
  const maschera = useId();
  const ordinate = fette.filter((f) => f.valore > 0).sort((a, b) => b.valore - a.valore);
  // Mai "altro (1)".
  const quante = ordinate.length > MASSIMO + 1 ? MASSIMO : ordinate.length;
  const resto = ordinate.slice(quante);
  const voci: Fetta[] = [
    ...ordinate.slice(0, quante),
    ...(resto.length
      ? [
          {
            nome: `altro (${resto.length})`,
            valore: resto.reduce((s, f) => s + f.valore, 0),
            spenta: resto.every((f) => f.spenta),
          },
        ]
      : []),
  ];
  const tutto = voci.reduce((s, f) => s + f.valore, 0) || 1;
  const totale = voci.reduce((s, f) => s + (f.spenta ? 0 : f.valore), 0);
  let inizio = 0;
  const archi = voci.map((f) => {
    const a = { inizio, quota: f.valore / tutto };
    inizio += a.quota;
    return a;
  });
  const scegli = (i: number) => setScelta(scelta === i ? null : i);
  const mostrata = scelta === null ? null : voci[scelta];

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90 overflow-visible" aria-hidden>
          {/* Un solo giro scopre tutte le fette. */}
          <mask id={maschera} maskUnits="userSpaceOnUse" x={-20} y={-20} width={SIZE + 40} height={SIZE + 40}>
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke="white"
              strokeWidth={SPESSORE + 14}
              pathLength={1}
              strokeDasharray={1}
              className="anello-riempi"
              style={
                {
                  "--giro": 1,
                  animationDuration: "1100ms",
                  animationDelay: "150ms",
                  animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
                } as React.CSSProperties
              }
            />
          </mask>
          <g mask={`url(#${maschera})`}>
            {voci.map((f, i) => {
              const { inizio, quota } = archi[i];
              const lungo = Math.max(0.001, quota - STACCO);
              return (
                <circle
                  key={f.nome}
                  cx={C}
                  cy={C}
                  r={R}
                  fill="none"
                  stroke={COLORI[i % COLORI.length]}
                  strokeWidth={scelta === i ? SPESSORE + 4 : scelta === null ? SPESSORE : SPESSORE - 4}
                  pathLength={1}
                  strokeDasharray={`${lungo} ${1 - lungo}`}
                  strokeDashoffset={-inizio}
                  className="cursor-pointer"
                  onClick={() => scegli(i)}
                  style={{
                    opacity: f.spenta ? 0.25 : scelta !== null && scelta !== i ? 0.35 : 1,
                    transition: "stroke-width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s",
                  }}
                />
              );
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <span className="text-lg leading-tight font-bold">
            <Cifre valore={mostrata ? mostrata.valore : totale} />
          </span>
          <span className="line-clamp-2 text-[11px] leading-tight text-muted">{mostrata ? mostrata.nome : unita}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {voci.map((f, i) => (
          <li key={f.nome}>
            <button
              type="button"
              aria-pressed={scelta === i}
              onClick={() => scegli(i)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-0.5 text-left text-sm transition-opacity duration-150"
              style={{
                opacity: scelta !== null && scelta !== i ? 0.4 : f.spenta ? 0.5 : 1,
              }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORI[i % COLORI.length] }} />
              <span className={`min-w-0 flex-1 truncate ${f.spenta ? "line-through" : ""}`}>{f.nome}</span>
              <span className="shrink-0 text-muted">{Math.round(f.valore)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
