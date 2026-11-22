"use client";

import { useRef, useState } from "react";

export type Voce = { chiave: string; minuti: number; titolo: string; testo: string };

const hhmm = (minuti: number) => `${String(Math.floor(minuti / 60)).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`;

// "Cena · 20:30" → "Cena": l'ora c'è già.
const nome = (v: Voce) => v.titolo.replace(` · ${hhmm(v.minuti)}`, "");

const SIZE = 240;
const C = SIZE / 2;
const R = 96;
// Mezzanotte in alto, senso orario.
const punto = (minuti: number, r: number) => {
  const a = (minuti / 1440) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};
// Circolare: 23:30 e 00:30 distano un'ora.
const distanza = (a: number, b: number) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));

export default function Orologio({ voci, minuti }: { voci: Voce[]; minuti: number }) {
  const [scelta, setScelta] = useState<string | null>(null);
  const mostrata = voci.find((v) => v.chiave === scelta) ?? voci.find((v) => v.minuti > minuti);
  const scegli = (chiave: string) => setScelta(scelta === chiave ? null : chiave);

  // Angolo sommato: la lancetta gira per la via più corta.
  const meta = ((voci.find((v) => v.chiave === scelta)?.minuti ?? minuti) / 1440) * 360;
  const [lancetta, setLancetta] = useState({ meta, gradi: meta });
  if (lancetta.meta !== meta) {
    setLancetta({ meta, gradi: lancetta.gradi + ((((meta - lancetta.meta + 540) % 360) + 360) % 360) - 180 });
  }

  // Un tocco sull'avviso già scelto lo toglie.
  const tocco = useRef<{ prima: string | null; mosso: boolean } | null>(null);
  const piuVicina = (e: React.PointerEvent<SVGElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const a = Math.atan2(e.clientX - box.left - C, -(e.clientY - box.top - C));
    const m = (((a / (2 * Math.PI)) * 1440) % 1440 + 1440) % 1440;
    return voci.reduce((x, v) => (distanza(v.minuti, m) < distanza(x.minuti, m) ? v : x)).chiave;
  };

  return (
    <section className="card pt-5" aria-label="Gli avvisi di oggi">
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="overflow-visible" aria-hidden>
          <g transform={`rotate(-90 ${C} ${C})`}>
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke="var(--line)"
              strokeWidth={10}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              className="anello-riempi"
              style={{ "--giro": 1 } as React.CSSProperties}
            />
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={10}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - minuti / 1440}
              className="anello-riempi"
              style={
                {
                  "--giro": 1,
                  animationDelay: "400ms",
                  transition: "stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
                } as React.CSSProperties
              }
            />
          </g>
          {Array.from({ length: 24 }, (_, h) => {
            const lunga = h % 6 === 0;
            const a = punto(h * 60, R - 12);
            const b = punto(h * 60, R - (lunga ? 20 : 15));
            return (
              <line
                key={h}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lunga ? "var(--muted)" : "var(--line)"}
                strokeWidth={lunga ? 2 : 1.5}
                strokeLinecap="round"
              />
            );
          })}
          {[0, 6, 12, 18].map((h) => {
            const p = punto(h * 60, R - 31);
            return (
              <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-muted text-[11px]">
                {h}
              </text>
            );
          })}
          <g
            className="lancetta-entra"
            style={{
              transformOrigin: `${C}px ${C}px`,
              transform: `rotate(${lancetta.gradi}deg)`,
              transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <line x1={C} y1={C - 58} x2={C} y2={C - R + 6} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
            {!scelta && <circle cx={C} cy={C - R} r={5} fill="var(--ink)" className="adesso-pulsa" />}
            <circle cx={C} cy={C - R} r={5} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
          </g>
          {voci.map((v) => {
            const p = punto(v.minuti, R);
            const fatta = v.minuti <= minuti;
            const grande = mostrata?.chiave === v.chiave;
            return (
              <circle
                key={v.chiave}
                cx={p.x}
                cy={p.y}
                r={grande ? 9 : 7}
                fill={fatta ? "var(--accent)" : "var(--card)"}
                stroke={fatta ? "var(--card)" : "var(--accent)"}
                strokeWidth={fatta ? 3 : 2.5}
                className="punto-entra"
                style={{
                  r: grande ? 9 : 7,
                  animationDelay: `${400 + (v.minuti / 1440) * 700}ms`,
                  opacity: scelta && scelta !== v.chiave ? 0.35 : 1,
                  transition: "opacity 0.15s, r 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            );
          })}
          {/* touch-action none solo sulla corona: altrove la pagina scorre. */}
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="transparent"
            strokeWidth={44}
            pointerEvents="stroke"
            className="cursor-pointer"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const k = piuVicina(e);
              tocco.current = { prima: scelta, mosso: false };
              setScelta(k);
            }}
            onPointerMove={(e) => {
              if (!tocco.current) return;
              const k = piuVicina(e);
              if (k !== scelta) {
                tocco.current.mosso = true;
                setScelta(k);
              }
            }}
            onPointerUp={(e) => {
              const t = tocco.current;
              tocco.current = null;
              if (t && !t.mosso && t.prima === piuVicina(e)) setScelta(null);
            }}
            onPointerCancel={() => (tocco.current = null)}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
          {mostrata ? (
            <>
              <span className="text-xs text-muted">
                {scelta ? (mostrata.minuti <= minuti ? "Già passato" : "Più tardi") : "Prossimo"}
              </span>
              <span className="text-3xl font-bold text-accent">{hhmm(mostrata.minuti)}</span>
              <span className="line-clamp-2 text-sm leading-tight font-semibold">{nome(mostrata)}</span>
            </>
          ) : (
            <span className="text-sm text-muted">Per oggi niente altro</span>
          )}
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line px-2 pb-2">
        {voci.map((v) => (
          <li key={v.chiave}>
            <button
              type="button"
              aria-pressed={scelta === v.chiave}
              onClick={() => scegli(v.chiave)}
              className={`flex w-full gap-4 rounded-2xl px-3 py-3 text-left transition-colors ${
                scelta === v.chiave ? "bg-accent-soft" : ""
              }`}
            >
              <span className={`w-12 shrink-0 font-semibold ${v.minuti <= minuti ? "text-muted" : "text-accent"}`}>
                {hhmm(v.minuti)}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{nome(v)}</span>
                <span className="block text-sm text-muted">{v.testo}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
