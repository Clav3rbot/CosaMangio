"use client";

import { useState } from "react";
import { CalendarClock, Check, ListFilter, PackageCheck, PackageX, Snowflake } from "lucide-react";
import ArrivoSpesa from "@/components/ArrivoSpesa";
import BottoneFatto from "@/components/BottoneFatto";
import { usePorzioni, useAdesso, useNomiScontrino, useScorte, useSpesa, type StatoSpesa } from "@/lib/dati";
import { aggiungiGiorni, dataLunga, piano, type VoceSpesa } from "@/lib/piano";
import type { NomeArticolo } from "@/lib/scontrino";
import { GIORNI_FRESCO, confezioniDaComprare, contaPerSpesa, quantoMostrare } from "@/lib/scorte";

export default function Spesa() {
  const { stato, errore, imposta } = useSpesa();
  const adesso = useAdesso();
  const scorte = useScorte(adesso, stato);
  const porzioni = usePorzioni(adesso, scorte.manca);
  const nomi = useNomiScontrino();
  const [soloMancanti, setSoloMancanti] = useState(false);
  const [arrivo, setArrivo] = useState(false);
  // Quanto avevi dei prodotti che hai segnato finiti: se era un tocco per sbaglio, la spunta lo rimette.
  const [tolti, setTolti] = useState<Record<string, number>>({});
  const s = stato ?? {};

  const hai = (v: VoceSpesa) => scorte.stima[v.id] ?? 0;
  // Quello che vale per la prossima spesa: i freschi arrivati da giorni no.
  const conta = (v: VoceSpesa) => contaPerSpesa(v, hai(v), scorte.giorni[v.id] ?? 0);
  const coperto = (v: VoceSpesa) => conta(v) >= v.q;
  const presi = piano.spesa.filter(coperto).length;
  // Cosa aspetti dalla consegna: quello che non hai già.
  const inArrivo = piano.spesa.filter((v) => !coperto(v));
  const daCongelare = piano.spesa.filter((v) => s[v.id] === "da_congelare");
  const nonArrivati = piano.spesa.filter((v) => s[v.id] === "manca");
  // Senza documento di consegna: si suppone che hai preso le confezioni che mancavano (almeno una).
  const compri = (v: VoceSpesa) => Math.max(1, confezioniDaComprare(v, conta(v))) * v.conf;

  /** Arrivato: si somma alle scorte (al posto del fresco vecchio); carne e pane passano da "porziona e congela", il
   *  non arrivato resta segnato. */
  function arrivati(quanti: Record<string, number>, mancanti: string[], impara: Record<string, NomeArticolo>) {
    const voce = (id: string) => piano.spesa.find((v) => v.id === id)!;
    imposta({
      ...Object.fromEntries(Object.keys(quanti).map((id) => [id, voce(id).tieni ? "da_congelare" : null] as const)),
      ...Object.fromEntries(mancanti.map((id) => [id, "manca" as StatoSpesa])),
    });
    scorte.imposta(Object.fromEntries(Object.entries(quanti).map(([id, q]) => [id, conta(voce(id)) + q])));
    if (Object.keys(impara).length) nomi.impara(impara);
    setArrivo(false);
  }

  /** Ce l'ho (comprato in negozio, o ne ho abbastanza): basta per la settimana. */
  function celho(v: VoceSpesa, daCongelare: boolean) {
    scorte.imposta({ [v.id]: Math.max(tolti[v.id] ?? 0, hai(v), v.q) });
    if (s[v.id] === "manca" || daCongelare) imposta({ [v.id]: daCongelare ? "da_congelare" : null });
  }

  /** È finito: la scorta va a zero. */
  function finito(v: VoceSpesa) {
    setTolti({ ...tolti, [v.id]: hai(v) });
    scorte.imposta({ [v.id]: 0 });
  }

  // Per ogni prodotto da congelare: quanto serve oggi e domani (resta fuori dal freezer), cosa va in freezer e quanto
  // avanza della confezione dopo i prossimi 7 giorni.
  const domani = adesso ? aggiungiGiorni(adesso.data, 1) : "";
  const sistemare = daCongelare.map((v) => {
    const lista = porzioni?.[v.id] ?? [];
    const presto = lista.filter((p) => p.giorno <= domani).reduce((t, p) => t + p.g, 0);
    // Spazi indivisibili: "avanzano 100 g" non va a capo a metà.
    const dopo = lista.filter((p) => p.giorno > domani).map((p) => `${p.g} g`);
    const avanzo = Math.round(hai(v) - lista.reduce((t, p) => t + p.g, 0));
    const parti = [...dopo, ...(avanzo >= 10 ? [`avanzano ${avanzo} g`] : [])];
    const freezer = v.congela ?? (parti.length ? parti.join(" · ") : presto ? "niente" : "tutto");
    return { v, presto, freezer };
  });
  const errori = [errore, scorte.errore, nomi.errore].filter(Boolean);

  return (
    <>
      <header className="pt-2">
        <p className="text-sm text-muted">Quanto serve per una settimana</p>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">Spesa</h1>
      </header>

      {errori.length > 0 && (
        <p role="alert" className="mt-4 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a leggere o salvare: {errori.join(" · ")}
        </p>
      )}

      <section className="card mt-4 p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">A posto</p>
          <p className="text-2xl font-bold">
            {presi}
            <span className="text-base font-medium text-muted">/{piano.spesa.length}</span>
          </p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${(presi / piano.spesa.length) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Quanto hai in casa lo calcolo dalla spesa arrivata, meno quello che usano i pasti del piano: ti dico
          cosa comprare per coprire una settimana. Il fresco arrivato da più di {GIORNI_FRESCO} giorni non lo conto. Se
          sbaglio, correggi con la spunta. Marca e formato li scegli tu con le offerte.
        </p>
        <button
          type="button"
          onClick={() => setSoloMancanti(!soloMancanti)}
          aria-pressed={soloMancanti}
          className={`chip mt-3 font-medium ${soloMancanti ? "border-accent bg-accent-soft text-accent" : ""}`}
        >
          <ListFilter className="h-4 w-4" /> Solo quello da comprare
        </button>
      </section>

      {scorte.prossima && (
        <section className="card mt-3 p-5" aria-label="Prossima spesa">
          <p className="flex items-center gap-2 font-semibold">
            <CalendarClock className="h-5 w-5 text-accent" /> Prossima spesa
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Falla arrivare prima di <strong>{dataLunga(scorte.prossima.data)}</strong>,{" "}
            {piano.pasti.find((p) => p.id === scorte.prossima!.pasto)!.nome.toLowerCase()}. Per quel giorno finiscono:{" "}
            {scorte.prossima.prodotti.map((id) => piano.spesa.find((v) => v.id === id)!.nome.toLowerCase()).join(", ")}.
          </p>
        </section>
      )}

      {inArrivo.length > 0 && !arrivo && (
        <button type="button" className="btn-primary mt-3 w-full" onClick={() => setArrivo(true)}>
          <PackageCheck className="h-5 w-5" /> Spesa arrivata
        </button>
      )}

      {arrivo && (
        <ArrivoSpesa
          inArrivo={inArrivo}
          compri={compri}
          nomi={nomi.nomi}
          onConferma={arrivati}
          onAnnulla={() => setArrivo(false)}
        />
      )}

      {nonArrivati.length > 0 && (
        <section className="card mt-4 p-5" aria-label="Non arrivato">
          <p className="flex items-center gap-2 font-semibold text-fat">
            <PackageX className="h-5 w-5" /> Non arrivato
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            I pasti che lo usano te lo segnalano, e la sera prima non ti dico di scongelarlo. Quando lo compri, tocca
            &quot;Ce l&apos;ho&quot;.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {nonArrivati.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold">{v.nome}</span>
                <button type="button" className="chip font-medium" onClick={() => celho(v, !!v.tieni)}>
                  <Check className="h-4 w-4 text-accent" /> Ce l&apos;ho
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sistemare.length > 0 && porzioni && (
        <section className="card mt-4 p-5" aria-label="Da porzionare e congelare">
          <p className="flex items-center gap-2 font-semibold">
            <Snowflake className="h-5 w-5 text-prot" /> Porziona e congela
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Una bustina per porzione, pesata sulle ricette dei prossimi 7 giorni. Quello che avanza va in freezer a
            porzioni uguali.
          </p>
          <p className="mt-3 text-sm font-semibold text-prot">In freezer</p>
          <ul className="divide-y divide-line text-sm">
            {sistemare.map(({ v, freezer }) => (
              <li key={v.id} className="flex justify-between gap-3 py-2">
                <span className="font-medium">{v.nome}</span>
                <span className="text-right">{freezer}</span>
              </li>
            ))}
          </ul>
          {sistemare.some((r) => r.presto) && (
            <>
              <p className="mt-3 text-sm font-semibold text-carb">Per oggi e domani</p>
              <ul className="divide-y divide-line text-sm">
                {sistemare
                  .filter((r) => r.presto)
                  .map(({ v, presto }) => (
                    <li key={v.id} className="flex justify-between gap-3 py-2">
                      <span className="font-medium">{v.nome}</span>
                      <span className="text-right">
                        {presto} g, {v.tieni}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => imposta(Object.fromEntries(daCongelare.map((v) => [v.id, null] as const)))}
          >
            <Check className="h-5 w-5" /> Fatto
          </button>
        </section>
      )}

      {soloMancanti && presi === piano.spesa.length && (
        <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">Non manca niente.</p>
      )}

      {piano.reparti.map((reparto) => {
        const voci = piano.spesa.filter((v) => v.reparto === reparto && !(soloMancanti && coperto(v)));
        const extra = soloMancanti ? [] : piano.spesaExtra.filter((v) => v.reparto === reparto);
        if (!voci.length && !extra.length) return null;
        return (
          <section key={reparto}>
            <h2 className="titolo-sezione">{reparto}</h2>
            <ul className="card divide-y divide-line">
              {voci.map((v) => {
                const st = s[v.id];
                const h = hai(v);
                const vecchio = h > 0 && conta(v) === 0;
                return (
                  <li key={v.id} className="flex items-center gap-3 py-2.5 pr-3 pl-4">
                    <div className={`min-w-0 flex-1 ${coperto(v) ? "opacity-50" : ""}`}>
                      <p className={`font-semibold ${coperto(v) ? "line-through" : ""}`}>
                        {v.nome} <span className="font-normal text-muted">· {v.serve}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {st === "manca" && <span className="font-medium text-fat">Non arrivato · </span>}
                        {coperto(v) ? (
                          <span className="font-medium text-accent">Ce l&apos;hai: ~{quantoMostrare(v, h)}</span>
                        ) : (
                          <>
                            {h > 0 && `Hai ~${quantoMostrare(v, h)}${vecchio ? ` da ${scorte.giorni[v.id]} giorni` : ""} · `}
                            compra {confezioniDaComprare(v, conta(v))} × {v.confNome}
                          </>
                        )}
                      </p>
                    </div>
                    <BottoneFatto
                      fatto={coperto(v)}
                      nome={v.nome}
                      azione="in casa"
                      onClick={() => (coperto(v) ? finito(v) : celho(v, false))}
                    />
                  </li>
                );
              })}
              {extra.map((v) => (
                <li key={v.nome} className="flex items-center justify-between gap-3 px-4 py-3">
                  <p className="font-semibold">{v.nome}</p>
                  <p className="text-xs text-muted">quando finisce</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

    </>
  );
}
