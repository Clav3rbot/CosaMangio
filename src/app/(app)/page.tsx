"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Apple, ChefHat, ChevronRight, Dumbbell, Flame, Minus, Plus, Snowflake, Target, UserRound } from "lucide-react";
import Acqua from "@/components/Acqua";
import Anello from "@/components/Anello";
import IconaPasto from "@/components/IconaPasto";
import BottoneFatto from "@/components/BottoneFatto";
import NonHai from "@/components/NonHai";
import { ALLENAMENTO, giorniSedute, nomiGiorni } from "@/lib/allenamento";
import { pastiCon, useAdesso, useFuoriPasto, useManca, useSettimana, useSpesa } from "@/lib/dati";
import {
  INIZIO,
  aggiungiGiorni,
  daScongelare,
  dataLunga,
  giornoDelPiano,
  giorniDellaSettimana,
  indiceGiorno,
  lunediDi,
  minutiDa,
  piano,
  senzaSaltati,
} from "@/lib/piano";

const LETTERE = ["L", "M", "M", "G", "V", "S", "D"];

export default function Page() {
  return (
    <Suspense>
      <Oggi />
    </Suspense>
  );
}

function Oggi() {
  const params = useSearchParams();
  const adesso = useAdesso();
  const oggi = adesso?.data ?? null;
  const giorno = params.get("d") ?? (oggi && giornoDelPiano(oggi));
  const { dati, errore: erroreSettimana, salvaPasto } = useSettimana(giorno ? lunediDi(giorno) : null);
  // I cibi fuori dai pasti si segnano per oggi e per i giorni passati, non per quelli che devono ancora venire.
  const fuori = useFuoriPasto(giorno && oggi && giorno <= oggi ? giorno : null);
  const errore = erroreSettimana ?? fuori.errore;
  const { stato: spesa } = useSpesa();
  const daCongelare = piano.spesa.filter((v) => spesa?.[v.id] === "da_congelare").map((v) => v.nome.toLowerCase());
  const manca = useManca(spesa, oggi);

  if (!giorno || !oggi || !adesso) return <div className="h-dvh" />;

  // kcal e prot = quello che mangi davvero, senza gli ingredienti saltati; quelli della ricetta sono l'obiettivo.
  const pasti = pastiCon(giorno, dati, manca).map((p) => ({ ...p, ...senzaSaltati(p.ricetta, p.saltati) }));
  const cibiFuori = fuori.righe.flatMap((r) => piano.cibi.filter((c) => c.id === r.cibo));
  const kcalFuori = cibiFuori.reduce((s, c) => s + c.kcal, 0);
  const kcalTot = pasti.reduce((s, p) => s + p.ricetta.kcal, 0);
  const kcalFatte = pasti.reduce((s, p) => s + (p.fatto ? p.kcal : 0), kcalFuori);
  const protTot = pasti.reduce((s, p) => s + p.ricetta.prot, 0);
  const protFatte = pasti.reduce((s, p) => s + (p.fatto ? p.prot : 0), cibiFuori.reduce((s, c) => s + c.prot, 0));
  const fatti = pasti.filter((p) => p.fatto).length;
  const sedute = dati?.allenamenti.length ?? 0;
  const eOggi = giorno === oggi;
  const prossimo = eOggi ? pasti.find((p) => !p.fatto && minutiDa(p.ora) + 60 > adesso.minuti) : undefined;
  const giorniAllenamento = giorniSedute(lunediDi(giorno), dati?.spostate);
  const giornoAllenamento = giorniAllenamento.includes(giorno);
  const allenatoOggi = !!dati?.allenamenti.includes(giorno);
  // "Stasera in frigo" parla di stasera, qualunque giorno stai guardando, come la notifica delle 22:30.
  const domani = aggiungiGiorni(oggi, 1);
  const inFrigo =
    domani < INIZIO
      ? []
      : [
          ...new Set(
            pastiCon(domani, lunediDi(domani) === lunediDi(giorno) ? dati : null, manca).flatMap((p) =>
              daScongelare(p.ricetta, manca)
            )
          ),
        ];

  return (
    <>
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-muted first-letter:uppercase">{dataLunga(giorno)}</p>
          <h1 className="text-[32px] leading-tight font-bold tracking-tight">
            {eOggi ? "Oggi" : piano.settimana[indiceGiorno(giorno)].giorno}
          </h1>
        </div>
        <Link
          href="/tu"
          aria-label="Profilo, notifiche e note del piano"
          className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card"
        >
          <UserRound className="h-5 w-5" />
        </Link>
      </header>

      <nav aria-label="Giorni della settimana" className="mt-4 grid grid-cols-7 gap-1">
        {giorniDellaSettimana(lunediDi(giorno)).map((d, n) => {
          const lista = pastiCon(d, dati, manca);
          const segnati = lista.filter((p) => p.fatto).length;
          const quota = segnati / lista.length;
          const scelto = d === giorno;
          return (
            <Link
              key={d}
              href={d === oggi ? "/" : `/?d=${d}`}
              aria-current={scelto ? "date" : undefined}
              // L'anello è solo grafico: il conto lo legge VoiceOver, come nel calendario del mese.
              aria-label={`${dataLunga(d)}: ${segnati} pasti su ${lista.length}`}
              className="flex flex-col items-center gap-1 text-xs text-muted"
            >
              {LETTERE[n]}
              <span
                className={`relative grid h-10 w-10 place-items-center rounded-full text-sm font-semibold ${
                  scelto ? "bg-accent text-accent-ink" : d === oggi ? "text-accent" : "text-ink"
                }`}
              >
                {!scelto && (
                  <span className="absolute inset-0">
                    <Anello valore={quota} size={40} spessore={3} />
                  </span>
                )}
                <span className="relative">{Number(d.slice(8))}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {oggi < INIZIO && (
        <p className="mt-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Il piano parte {dataLunga(INIZIO)}: le notifiche dei pasti partono da lì. La sera prima, alle 22:30, ti
          avviso cosa spostare dal freezer al frigo.
        </p>
      )}

      {daCongelare.length > 0 && (
        <Link href="/spesa" className="card mt-4 flex items-center gap-3 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-prot">
            <Snowflake className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Spesa arrivata: porziona e congela</span>
            <span className="block text-sm text-muted first-letter:uppercase">{daCongelare.join(", ")}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      )}

      {(inFrigo.length > 0 || (giornoAllenamento && !allenatoOggi)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {ALLENAMENTO && giornoAllenamento && !allenatoOggi && (
            <Link href="/allenamento" className="chip">
              <Dumbbell className="h-4 w-4 text-fat" /> Allenamento alle {ALLENAMENTO.ora}
            </Link>
          )}
          {inFrigo.length > 0 && (
            <span className="chip">
              <Snowflake className="h-4 w-4 text-prot" /> Stasera in frigo: {inFrigo.join(", ")}
            </span>
          )}
        </div>
      )}

      {errore && (
        <p role="alert" className="mt-4 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a salvare o leggere i dati: {errore}
        </p>
      )}

      <section className="card mt-4 px-5 pt-4 pb-5" aria-label="Calorie del giorno">
        <div className="flex justify-between">
          <div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent">
              <Flame className="h-4 w-4" />
            </span>
            <p className="mt-1 text-lg font-semibold">{kcalFatte}</p>
            <p className="text-xs text-muted">mangiate</p>
          </div>
          <div className="flex flex-col items-end">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-carb-soft text-carb">
              <Target className="h-4 w-4" />
            </span>
            <p className="mt-1 text-lg font-semibold">{kcalTot}</p>
            <p className="text-xs text-muted">obiettivo</p>
          </div>
        </div>
        <div className="-mt-8 flex justify-center">
          <Anello valore={kcalTot ? kcalFatte / kcalTot : 0}>
            <span className="text-4xl font-bold">{Math.max(0, kcalTot - kcalFatte)}</span>
            <span className="text-sm text-muted">kcal da mangiare</span>
          </Anello>
        </div>
      </section>

      <section className={`mt-3 grid gap-3 ${ALLENAMENTO ? "grid-cols-3" : "grid-cols-2"}`} aria-label="Riepilogo">
        <Riquadro colore="var(--prot)" nome="proteine" valore={protFatte} totale={protTot} unita=" g" />
        <Riquadro colore="var(--carb)" nome="pasti" valore={fatti} totale={pasti.length} />
        {ALLENAMENTO && (
          <Riquadro colore="var(--fat)" nome="allenamenti" valore={sedute} totale={ALLENAMENTO.giorni.length} />
        )}
      </section>

      {eOggi && <Acqua key={giorno} giorno={giorno} />}

      {prossimo && (
        <section className="card mt-4 bg-accent-soft p-5" aria-label="Prossimo pasto">
          <p className="text-sm font-semibold text-accent">
            Prossimo · {prossimo.nome} alle {prossimo.ora}
          </p>
          <p className="mt-1 text-xl leading-snug font-semibold">{prossimo.ricetta.nome}</p>
          <p className="mt-0.5 text-sm text-muted">
            {prossimo.kcal} kcal · {prossimo.prot} g proteine
            {prossimo.ricetta.minuti > 0 && ` · ${prossimo.ricetta.minuti} min`}
          </p>
          <NonHai r={prossimo.ricetta} manca={manca} />
          <div className="mt-4 flex gap-2">
            {prossimo.ricetta.passi.length > 0 && (
              <Link href={`/pasto?d=${giorno}&p=${prossimo.id}&cucina=1`} className="btn-primary">
                <ChefHat className="h-5 w-5" /> Cucina
              </Link>
            )}
            <Link href={`/pasto?d=${giorno}&p=${prossimo.id}`} className="btn-ghost">
              {prossimo.opzioni.length > 1 ? "Ricetta e alternative" : "Ricetta"}
            </Link>
          </div>
        </section>
      )}

      <h2 className="titolo-sezione">Pasti</h2>
      <ul className="space-y-2.5">
        {pasti.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 p-3 pr-2">
            <Link href={`/pasto?d=${giorno}&p=${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                  p.fatto ? "bg-accent-soft text-accent" : "bg-bg text-muted"
                }`}
              >
                <IconaPasto id={p.id} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted">
                  {p.nome} · {p.ora}
                </span>
                <span className={`block truncate font-semibold ${p.fatto ? "text-muted line-through" : ""}`}>
                  {p.ricetta.nome}
                </span>
                <span className="block text-xs text-muted">
                  {p.kcal} kcal · {p.prot} g prot.
                  {p.opzioni.length > 1 && ` · ${p.opzioni.length} ricette`}
                </span>
                {!p.fatto && <NonHai r={p.ricetta} manca={manca} />}
              </span>
            </Link>
            <BottoneFatto
              fatto={p.fatto}
              nome={p.ricetta.nome}
              // Mangiato: la ricetta in uso diventa scelta, così non cambia più se poi cambia quello che hai.
              onClick={() => salvaPasto(giorno, p.id, p.fatto ? { fatto: false } : { fatto: true, ricetta: p.rid })}
            />
          </li>
        ))}
      </ul>

      {giorno <= oggi && (
        <details className="card mt-4 p-4" open={cibiFuori.length > 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <Apple className="h-4 w-4 text-accent" /> Fuori dai pasti
            {cibiFuori.length > 0 && <span className="ml-auto text-sm font-normal text-muted">{kcalFuori} kcal</span>}
          </summary>
          <p className="mt-1 text-sm text-muted">Quello che mangi in più: ogni + è una porzione.</p>
          <ul className="mt-2 divide-y divide-line">
            {piano.cibi.map((c) => {
              const n = cibiFuori.filter((x) => x === c).length;
              return (
                <li key={c.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.nome}</span>
                    <span className="block text-xs text-muted">
                      {c.porzione} · {c.kcal} kcal · {c.prot} g prot.
                    </span>
                  </span>
                  {n > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => fuori.togli(c.id)}
                        aria-label={`Togli una porzione: ${c.nome}`}
                        className="grid h-11 w-11 place-items-center rounded-full bg-bg"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-5 text-center font-semibold">{n}</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => fuori.aggiungi(c.id)}
                    aria-label={`Aggiungi una porzione: ${c.nome}`}
                    className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {ALLENAMENTO && (
        <Link href="/allenamento" className="card mt-4 flex items-center gap-3 p-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fat-soft text-fat">
            <Dumbbell className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Allenamento della settimana</span>
            <span className="block text-sm text-muted">
              {sedute} di {ALLENAMENTO.giorni.length} sedute · {nomiGiorni(giorniAllenamento)} alle {ALLENAMENTO.ora}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Link>
      )}
    </>
  );
}

function Riquadro({
  colore,
  nome,
  valore,
  totale,
  unita = "",
}: {
  colore: string;
  nome: string;
  valore: number;
  totale: number;
  unita?: string;
}) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: colore }} />
        {nome}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-line">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${totale ? Math.min(100, (valore / totale) * 100) : 0}%`, background: colore }}
        />
      </div>
      <p className="mt-1.5 text-sm font-semibold">
        {valore}/{totale}
        {unita}
      </p>
    </div>
  );
}
