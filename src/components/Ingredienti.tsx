"use client";

import { useState } from "react";

/** Con saltati e onTocca le spunte le tiene la pagina; senza, durano finché resti sulla pagina. */
export default function Ingredienti({
  voci,
  grande = false,
  saltati,
  onTocca,
  sostituti,
  onSostituto,
}: {
  voci: [string, string][];
  grande?: boolean;
  saltati?: string[];
  onTocca?: (nome: string) => void;
  /** Ingredienti che mancano: fra cosa scegliere e cosa conta come usato (vedi sostitutiDi). */
  sostituti?: { nome: string; prodotto: string; opzioni: { id: string; nome: string }[]; usato?: string }[];
  onSostituto?: (prodotto: string, id: string) => void;
}) {
  const [pronti, setPronti] = useState<string[]>([]);
  const segnati = saltati ?? pronti;
  const tocca =
    onTocca ?? ((nome: string) => setPronti(pronti.includes(nome) ? pronti.filter((n) => n !== nome) : [...pronti, nome]));
  return (
    <ul className="card divide-y divide-line px-5">
      {voci.map(([nome, qta]) => {
        const segnato = segnati.includes(nome);
        const s = sostituti?.find((x) => x.nome === nome);
        return (
          <li key={nome}>
            <button
              type="button"
              aria-pressed={segnato}
              onClick={() => tocca(nome)}
              className={`flex w-full justify-between gap-4 py-3 text-left ${grande ? "text-[17px]" : "text-[15px]"} ${
                segnato ? "text-muted line-through" : ""
              }`}
            >
              <span>{nome}</span>
              <span className="shrink-0 font-semibold">{qta}</span>
            </button>
            {s && (
              <div role="group" aria-label={`Al posto di ${nome}`} className="-mt-1 flex flex-wrap items-center gap-1.5 pb-3">
                <span className="text-xs font-medium text-carb">Non ce l&apos;hai, al suo posto:</span>
                {s.opzioni.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={o.id === s.usato}
                    onClick={() => onSostituto?.(s.prodotto, o.id)}
                    className={`chip ${o.id === s.usato ? "border-carb bg-carb-soft font-medium text-carb" : "text-muted"}`}
                  >
                    {o.nome}
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
