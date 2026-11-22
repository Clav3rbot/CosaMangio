"use client";

import { useState } from "react";
import Cifre from "@/components/Cifre";

/** legenda: false se i numeri sono già altrove. */
export type DatoAnello = { nome: string; valore: number; totale: number; colore: string; unita?: string; legenda?: boolean };

/** pronto: false finché i valori non sono definitivi, così gli anelli si riempiono una volta sola. */
export default function Anelli({
  anelli,
  size = 256,
  spessore = 10,
  spazio = 4,
  pronto = true,
  children,
}: {
  anelli: DatoAnello[];
  size?: number;
  spessore?: number;
  spazio?: number;
  pronto?: boolean;
  children: React.ReactNode;
}) {
  const [attivo, setAttivo] = useState<number | null>(null);
  const c = size / 2;
  const raggio = (i: number) => c - 8 - spessore / 2 - i * (spessore + spazio);
  // ± spazio: la distanza fra gli anelli non cambia.
  const tratto = (i: number) => (attivo === null ? spessore : attivo === i ? spessore + spazio : spessore - spazio);
  const molla = "0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
  const scelto = attivo === null ? null : anelli[attivo];

  const legenda = anelli.map((a, i) => ({ ...a, i })).filter((a) => a.legenda !== false);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden>
          {anelli.map((a, i) => {
            const r = raggio(i);
            const giro = 2 * Math.PI * r;
            const v = pronto ? Math.min(1, Math.max(0, a.totale ? a.valore / a.totale : 0)) : 0;
            return (
              <g
                key={a.nome}
                style={{ opacity: attivo !== null && attivo !== i ? 0.35 : 1, transition: "opacity 0.2s" }}
              >
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={attivo === i ? `color-mix(in srgb, ${a.colore} 25%, var(--line))` : "var(--line)"}
                  strokeWidth={tratto(i)}
                  strokeLinecap="round"
                  strokeDasharray={giro}
                  className="anello-riempi"
                  style={
                    {
                      "--giro": giro,
                      animationDelay: `${i * 90}ms`,
                      transition: `stroke-width ${molla}, stroke 0.2s`,
                    } as React.CSSProperties
                  }
                />
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={a.colore}
                  strokeWidth={tratto(i)}
                  strokeLinecap="round"
                  strokeDasharray={giro}
                  strokeDashoffset={giro * (1 - v)}
                  // L'animazione gira solo al montaggio; dopo lavora la transizione.
                  className="anello-riempi"
                  style={
                    {
                      "--giro": giro,
                      "--visibile": v > 0 ? 1 : 0,
                      animationDelay: `${500 + i * 100}ms`,
                      // A zero il tratto tondo lascerebbe un punto.
                      opacity: v > 0 ? 1 : 0,
                      transition: `stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1), stroke-width ${molla}, opacity 0.2s linear ${v > 0 ? 0 : 0.5}s`,
                    } as React.CSSProperties
                  }
                />
              </g>
            );
          })}
          {/* Fasce ferme: l'anello che si ispessisce non sfugge al dito. */}
          {anelli.map((a, i) => (
            <circle
              key={a.nome}
              cx={c}
              cy={c}
              r={raggio(i)}
              fill="none"
              stroke="transparent"
              strokeWidth={spessore + spazio}
              pointerEvents="stroke"
              className="cursor-pointer"
              onPointerEnter={(e) => e.pointerType === "mouse" && setAttivo(i)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setAttivo(null)}
              onPointerDown={(e) => e.pointerType !== "mouse" && setAttivo(attivo === i ? null : i)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {scelto ? (
            <>
              <span className="text-4xl font-bold" style={{ color: scelto.colore }}>
                <Cifre valore={scelto.valore} />
              </span>
              <span className="text-sm text-muted">
                di {scelto.totale}
                {scelto.unita} {scelto.nome}
              </span>
            </>
          ) : (
            children
          )}
        </div>
      </div>
      {legenda.length > 0 && (
        <div className="mt-2 grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${legenda.length}, minmax(0, 1fr))` }}>
          {legenda.map((a) => (
            <button
              key={a.nome}
              type="button"
              aria-pressed={attivo === a.i}
              onClick={() => setAttivo(attivo === a.i ? null : a.i)}
              className="rounded-2xl bg-bg px-3 py-2 text-left transition-opacity duration-150"
              style={{ opacity: attivo !== null && attivo !== a.i ? 0.35 : 1 }}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.colore }} />
                {a.nome}
              </span>
              <span className="mt-0.5 block text-sm font-semibold">
                {a.valore}/{a.totale}
                {a.unita}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
