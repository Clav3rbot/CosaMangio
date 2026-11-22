"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowLeftRight, Beef, ChefHat, ChevronLeft, Clock, Flame, PackageX, Snowflake, Timer } from "lucide-react";
import BottoneFatto from "@/components/BottoneFatto";
import Ciambella from "@/components/Ciambella";
import Guida, { guidaDaRiaprire } from "@/components/Guida";
import IconaPasto from "@/components/IconaPasto";
import Ingredienti from "@/components/Ingredienti";
import NonHai from "@/components/NonHai";
import { chiavePasto, useAdesso, useManca, useSettimana, useSpesa, type StatoPasto } from "@/lib/dati";
import {
  daScongelare,
  dataLunga,
  giorniDellaSettimana,
  lunediDi,
  mancantiDi,
  minutiNelPasso,
  timerNelPasso,
  pastiDelGiorno,
  piano,
  ricettaProposta,
  senzaSaltati,
  sorelleDi,
  sostitutiDi,
  type PastoId,
} from "@/lib/piano";
import { ricettaDi } from "@/lib/promemoria";

export default function Page() {
  return (
    <Suspense>
      <Pasto />
    </Suspense>
  );
}

function Pasto() {
  const params = useSearchParams();
  const router = useRouter();
  const giorno = params.get("d") ?? "";
  const slot = /^\d{4}-\d{2}-\d{2}$/.test(giorno)
    ? pastiDelGiorno(giorno).find((s) => s.id === params.get("p"))
    : undefined;
  const { dati, errore, salvaPasto } = useSettimana(slot ? lunediDi(giorno) : null);
  const { stato: spesa } = useSpesa();
  const adesso = useAdesso();
  const manca = useManca(spesa, adesso?.data ?? null);
  const riapri = `/pasto?d=${giorno}&p=${params.get("p")}`;
  const [guida, setGuida] = useState(() => params.get("cucina") === "1" || guidaDaRiaprire() === riapri);
  // Condivise fra schermata iniziale e tendina dei passi della guida.
  const [pronti, setPronti] = useState<string[]>([]);

  if (!slot) {
    return (
      <p className="pt-10 text-center text-muted">
        Pasto non trovato. <Link href="/" className="text-accent underline">Torna a oggi</Link>
      </p>
    );
  }

  const stato = dati?.pasti[chiavePasto(giorno, slot.id)];
  const rid = ricettaDi(giorno, slot, () => stato?.ricetta, manca);
  const r = piano.ricette[rid];
  const proposta = ricettaProposta(giorno, slot.opzioni, manca);
  // La rotazione da sola avrebbe proposto un piatto che usa qualcosa che non hai.
  const sostituita = proposta !== ricettaProposta(giorno, slot.opzioni);
  const fatto = !!stato?.fatto;
  const saltati = stato?.saltati ?? [];
  const mangiati = senzaSaltati(r, saltati);
  const salva = (modifica: Partial<StatoPasto>) => salvaPasto(giorno, slot.id as PastoId, modifica);
  // Fissa la ricetta: i saltati valgono per quella in uso.
  const salta = (nome: string) =>
    salva({ ricetta: rid, saltati: saltati.includes(nome) ? saltati.filter((n) => n !== nome) : [...saltati, nome] });
  // Fissa la ricetta: non cambia più se poi cambia quello che hai.
  const segna = (mangiato: boolean) => salva(mangiato ? { fatto: true, ricetta: rid } : { fatto: false });
  const scelti = stato?.sostituti ?? {};
  const nonHai = mancantiDi(r, manca, scelti);
  const sostituti = sostitutiDi(r, manca, scelti);
  // Fissa la ricetta, come i saltati; toccare di nuovo quello scelto torna alla proposta.
  const sostituisci = (prodotto: string, id: string) => {
    const { [prodotto]: prima, ...altri } = scelti;
    salva({ ricetta: rid, sostituti: prima === id ? altri : { ...altri, [prodotto]: id } });
  };
  // Una ricetta arrivata da uno scambio non è fra le opzioni del giorno.
  const opzioni = slot.opzioni.includes(rid) ? slot.opzioni : [...new Set([rid, ...sorelleDi(slot.id, rid), ...slot.opzioni])];

  const scambi =
    adesso && !fatto
      ? giorniDellaSettimana(lunediDi(giorno)).flatMap((d) => {
          const altro = pastiDelGiorno(d).find((s) => s.id === slot.id);
          const st = dati?.pasti[chiavePasto(d, slot.id)];
          if (d === giorno || d < adesso.data || !altro || st?.fatto) return [];
          const suo = ricettaDi(d, altro, () => st?.ricetta, manca);
          return suo === rid ? [] : [{ d, rid: suo }];
        })
      : [];
  const rimedi = [
    ...(scambi.length ? ["scambiare il pasto con un altro giorno qui sotto"] : []),
    // Le alternative usano quasi sempre gli stessi ingredienti: solo se una evita quello che manca.
    ...(opzioni.some((id) => id !== rid && !mancantiDi(piano.ricette[id], manca).length)
      ? ["scegliere un'altra ricetta"]
      : []),
    "ricomprare quello che manca",
  ];
  const scambia = (d: string, suo: string) => {
    salvaPasto(giorno, slot.id, { ricetta: suo, saltati: [], sostituti: {} });
    salvaPasto(d, slot.id, { ricetta: rid, saltati: [], sostituti: {} });
  };
  const daPreparare = (
    <Ingredienti
      voci={r.ingredienti}
      grande
      sostituti={sostituti}
      onSostituto={sostituisci}
      saltati={pronti}
      onTocca={(nome) => setPronti(pronti.includes(nome) ? pronti.filter((n) => n !== nome) : [...pronti, nome])}
    />
  );

  return (
    <>
      <header className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => (history.length > 1 ? router.back() : router.push("/"))}
          aria-label="Indietro"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-card"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-sm text-muted first-letter:uppercase">
            {dataLunga(giorno)} · {slot.ora}
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <IconaPasto id={slot.id} className="h-6 w-6 text-accent" /> {slot.nome}
          </h1>
        </div>
      </header>

      {errore && (
        <p role="alert" className="mt-4 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          Non riesco a salvare: {errore}
        </p>
      )}

      {nonHai.length > 0 && !fatto && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
          <PackageX className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Manca dalla spesa: {nonHai.join(", ")}. Puoi {rimedi.slice(0, -1).join(", ")}
            {rimedi.length > 1 && " o "}
            {rimedi[rimedi.length - 1]}.
          </span>
        </p>
      )}

      {opzioni.length > 1 && (
        <>
          <h2 className="titolo-sezione">Scegli la ricetta</h2>
          <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Ricette">
            {opzioni.map((id) => {
              const o = piano.ricette[id];
              const attiva = id === rid;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={attiva}
                  onClick={() => salva({ ricetta: id, saltati: [], sostituti: {} })}
                  className={`w-40 shrink-0 snap-start rounded-3xl border-2 p-3 text-left transition ${
                    attiva ? "border-accent bg-accent-soft" : "border-transparent bg-card"
                  }`}
                >
                  <span className="line-clamp-2 block min-h-10 text-sm leading-tight font-semibold">{o.nome}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {o.kcal} kcal{o.minuti > 0 && ` · ${o.minuti} min`}
                  </span>
                  {id === proposta && (
                    <span className="mt-1.5 inline-block rounded-full bg-carb-soft px-2 py-0.5 text-[11px] font-medium text-carb">
                      {sostituita ? "Con quello che hai" : "Proposta della settimana"}
                    </span>
                  )}
                  {!slot.opzioni.includes(id) && (
                    <span className="mt-1.5 inline-block rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
                      Da un altro giorno
                    </span>
                  )}
                  <NonHai r={o} manca={manca} scelti={attiva ? scelti : undefined} />
                </button>
              );
            })}
          </div>
        </>
      )}

      <section className="card mt-4 p-5">
        <h2 className="text-xl leading-snug font-semibold">{r.nome}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip bg-bg">
            <Flame className="h-4 w-4 text-accent" /> {mangiati.kcal} kcal
          </span>
          <span className="chip bg-bg">
            <Beef className="h-4 w-4 text-prot" /> {mangiati.prot} g proteine
          </span>
          {r.minuti > 0 && (
            <span className="chip bg-bg">
              <Clock className="h-4 w-4 text-carb" /> {r.minuti} min
            </span>
          )}
        </div>
        {r.kcal > 0 && (
          <div className="mt-4">
            <Ciambella
              fette={r.ingredienti.map(([nome], i) => ({ nome, valore: r.valori[i].kcal, spenta: saltati.includes(nome) }))}
              unita="kcal"
            />
          </div>
        )}
        {daScongelare(r, manca).length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-bg px-3 py-2.5 text-sm">
            <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-prot" />
            Dal freezer al frigo la sera prima: {daScongelare(r, manca).join(", ")}.
          </p>
        )}
        {(r.nota || r.fuori) && (
          <p className="mt-3 text-sm text-muted">{r.nota ?? "Fuori casa, niente da cucinare."}</p>
        )}
      </section>

      {scambi.length > 0 && (
        <details className="card mt-4 p-4" open={nonHai.length > 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-muted" /> Scambia con un altro giorno
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {scambi.map(({ d, rid: suo }) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => scambia(d, suo)}
                  aria-label={`Scambia con ${dataLunga(d)}: ${piano.ricette[suo].nome}`}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted first-letter:uppercase">{dataLunga(d)}</span>
                    <span className="block truncate font-semibold">{piano.ricette[suo].nome}</span>
                    <NonHai r={piano.ricette[suo]} manca={manca} />
                  </span>
                  <ArrowLeftRight className="h-4 w-4 shrink-0 text-accent" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2 className="titolo-sezione">Ingredienti</h2>
      <p className="-mt-1 mb-2 px-1 text-sm text-muted">
        Tocca quello che non mangi: esce dalle calorie e resta nelle scorte. Se manca qualcosa, tocca cosa usi al suo
        posto: le scorte scalano quello.
      </p>
      <Ingredienti
        key={rid}
        voci={r.ingredienti}
        saltati={saltati}
        onTocca={salta}
        sostituti={sostituti}
        onSostituto={sostituisci}
      />

      {r.passi.length > 0 && (
        <>
          <h2 className="titolo-sezione">Come si fa</h2>
          <ol className="card space-y-4 p-5">
            {r.passi.map((p, n) => {
              const min = minutiNelPasso(p);
              return (
                <li key={n} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    {n + 1}
                  </span>
                  <span className="text-[15px] leading-relaxed">
                    {p}
                    {min.map((m, k) => (
                      <span
                        key={k}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-carb-soft px-2 py-0.5 align-middle text-xs font-medium text-carb"
                      >
                        <Timer className="h-3 w-3" /> {m} min
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <div className="mt-6 flex items-center gap-3">
        {r.passi.length > 0 && (
          <button type="button" onClick={() => setGuida(true)} className="btn-primary flex-1">
            <ChefHat className="h-5 w-5" /> Inizia a cucinare
          </button>
        )}
        <div className={`flex items-center gap-3 ${r.passi.length ? "" : "card flex-1 p-3 pl-5"}`}>
          {!r.passi.length && <span className="flex-1 font-semibold">{fatto ? "Mangiato" : "Segna come mangiato"}</span>}
          <BottoneFatto fatto={fatto} nome={r.nome} onClick={() => segna(!fatto)} />
        </div>
      </div>

      {guida && r.passi.length > 0 && (
        <Guida
          // Mentre arrivano i dati la ricetta può cambiare: la guida riparte da quella giusta.
          key={r.nome}
          titolo={r.nome}
          riapri={riapri}
          passi={r.passi.map((testo, n) => ({
            titolo: `Passo ${n + 1}`,
            testo,
            timer: timerNelPasso(testo, r.nome),
          }))}
          intro={
            <>
              <p className="text-sm font-semibold text-accent">Prepara gli ingredienti</p>
              <h2 className="mt-1 text-[26px] leading-snug font-semibold">{r.nome}</h2>
              <p className="mt-1 mb-4 text-sm text-muted">Tocca quelli che hai già sul piano di lavoro.</p>
              {daPreparare}
            </>
          }
          ingredienti={daPreparare}
          etichettaFine={fatto ? "Fine" : "Fatto, segna come mangiato"}
          onFine={() => {
            if (!fatto) segna(true);
            setGuida(false);
          }}
          onChiudi={() => setGuida(false)}
        />
      )}
    </>
  );
}
