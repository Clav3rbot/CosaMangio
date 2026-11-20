"use client";

import { useState } from "react";

/** Lista ingredienti. Con "saltati" e "onTocca" le spunte le tiene la pagina (nel pasto: quelli che non hai mangiato,
 *  salvati; nella guida: quelli già pronti); senza, lo spunti mentre lo prepari e la spunta vale finché resti sulla pagina. */
export default function Ingredienti({
  voci,
  grande = false,
  saltati,
  onTocca,
}: {
  voci: [string, string][];
  grande?: boolean;
  saltati?: string[];
  onTocca?: (nome: string) => void;
}) {
  const [pronti, setPronti] = useState<string[]>([]);
  const segnati = saltati ?? pronti;
  const tocca =
    onTocca ?? ((nome: string) => setPronti(pronti.includes(nome) ? pronti.filter((n) => n !== nome) : [...pronti, nome]));
  return (
    <ul className="card divide-y divide-line px-5">
      {voci.map(([nome, qta]) => {
        const segnato = segnati.includes(nome);
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
          </li>
        );
      })}
    </ul>
  );
}
