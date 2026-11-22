"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import Anello from "@/components/Anello";
import BottoneFatto from "@/components/BottoneFatto";
import Guida, { guidaDaRiaprire } from "@/components/Guida";
import { giorniSedute, passiSeduta } from "@/lib/allenamento";
import { useAdesso, useSettimana } from "@/lib/dati";
import { dataBreve, dataLunga, giorniDellaSettimana, lunediDi, piano, type Allenamento as Piano } from "@/lib/piano";

export default function Allenamento() {
  // Senza allenamento ci si arriva solo scrivendo l'indirizzo.
  if (!piano.allenamento) return <p className="pt-8 text-center text-muted">Il piano non ha un allenamento.</p>;
  return <Seduta a={piano.allenamento} />;
}

function Seduta({ a }: { a: Piano }) {
  const adesso = useAdesso();
  const oggi = adesso?.data ?? null;
  const lunedi = oggi ? lunediDi(oggi) : null;
  const { dati, errore, segnaAllenamento, spostaSeduta } = useSettimana(lunedi);
  const [guida, setGuida] = useState(() => guidaDaRiaprire() === "/allenamento");

  if (!oggi || !lunedi) return <div className="h-dvh" />;

  const sedute = [...(dati?.allenamenti ?? [])].sort();
  const fattoOggi = sedute.includes(oggi);
  const previste = giorniSedute(lunedi, dati?.spostate);

  return (
    <>
      <header className="pt-2">
        <p className="text-sm text-muted first-letter:uppercase">{a.descrizione}</p>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">Allenamento</h1>
      </header>

      {errore && (
        <p role="alert" className="mt-4 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a salvare: {errore}
        </p>
      )}

      <section className="card mt-4 flex items-center gap-5 p-5">
        <Anello valore={sedute.length / a.giorni.length} size={96} spessore={10} colore="var(--fat)">
          <span className="text-2xl font-bold">
            {sedute.length}/{a.giorni.length}
          </span>
        </Anello>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Questa settimana, alle {a.ora}</p>
          <div className="mt-2 space-y-1.5">
            {previste.map((g, i) => (
              <select
                key={g}
                value={g}
                onChange={(e) => spostaSeduta(g, e.target.value)}
                aria-label={`Giorno della seduta ${i + 1}`}
                className="w-full rounded-xl border border-line bg-card px-2 py-1.5 text-sm font-semibold"
              >
                {giorniDellaSettimana(lunedi).map((d) => (
                  <option key={d} value={d} disabled={d !== g && (d < oggi || previste.includes(d))}>
                    {dataLunga(d)}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Tocca un giorno per spostare la seduta.</p>
          {sedute.length > 0 && (
            <p className="mt-1 text-sm text-muted">Fatte: {sedute.map(dataBreve).join(", ")}</p>
          )}
        </div>
      </section>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => setGuida(true)} className="btn-primary flex-1">
          <Play className="h-5 w-5" /> Inizia la seduta guidata
        </button>
        <BottoneFatto fatto={fattoOggi} nome="La seduta di oggi" azione="fatta" onClick={() => segnaAllenamento(oggi)} />
      </div>

      <h2 className="titolo-sezione">La seduta</h2>
      <ol className="card divide-y divide-line px-5">
        {a.riscaldamento && (
          <li className="py-3">
            <p className="font-semibold">
              {a.riscaldamento.nome}{" "}
              {a.riscaldamento.secondi ? (
                <span className="font-normal text-muted">· {Math.round(a.riscaldamento.secondi / 60)} min</span>
              ) : null}
            </p>
            <p className="text-sm text-muted">{a.riscaldamento.dettaglio}</p>
          </li>
        )}
        {a.circuito.map((e) => (
          <li key={e.nome} className="py-3">
            <p className="font-semibold">
              {e.nome}{" "}
              <span className="font-normal text-muted">· {e.secondi ? `${e.secondi} s` : a.ripetizioni}</span>
            </p>
            <p className="text-sm text-muted">{e.dettaglio}</p>
          </li>
        ))}
        <li className="py-3 text-sm text-muted">
          {/* Una stringa sola: con l'entità &apos; nel testo, Turbopack toglieva lo spazio prima di "secondi". */}
          {`${a.giri === 1 ? "Un giro" : `${a.giri} giri`}, con ${a.pausa} secondi di pausa tra un esercizio e l'altro.`}
        </li>
      </ol>

      {a.progressione.length > 0 && (
        <>
          <h2 className="titolo-sezione">Come progredire</h2>
          <ul className="card space-y-3 p-5 text-[15px] leading-relaxed">
            {a.progressione.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}

      {guida && (
        <Guida
          titolo="Allenamento"
          riapri="/allenamento"
          passi={passiSeduta(a).map((e) => ({ titolo: e.nome, testo: e.dettaglio, timer: e.secondi ? [{ nome: e.nome, secondi: e.secondi }] : [] }))}
          etichettaFine={fattoOggi ? "Fine" : "Fatto, segna la seduta"}
          onFine={() => {
            if (!fattoOggi) segnaAllenamento(oggi);
            setGuida(false);
          }}
          onChiudi={() => setGuida(false)}
        />
      )}
    </>
  );
}
