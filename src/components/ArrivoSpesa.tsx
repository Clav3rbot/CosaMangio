"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { dataLunga, piano, type VoceSpesa } from "@/lib/piano";
import {
  confezioniRiga,
  leggiDocumento,
  prodottoRiga,
  quantitaRiga,
  type Documento,
  type NomeArticolo,
  type RigaScontrino,
} from "@/lib/scontrino";
import { quantoMostrare } from "@/lib/scorte";

const voci = new Map(piano.spesa.map((v) => [v.id, v]));

// L'ultimo documento confermato, per accorgersi se lo ricarichi: le scorte si sommerebbero due volte. Sta sul
// telefono: da un altro dispositivo l'avviso non c'è.
const ULTIMO = "dieta:ultimo-documento";
const impronta = (d: Documento) => `${d.data}|${d.righe.map((r) => `${r.codice}:${r.qta}`).join(",")}`;
function ultimoDocumento(nuovo?: string) {
  try {
    if (nuovo) localStorage.setItem(ULTIMO, nuovo);
    return localStorage.getItem(ULTIMO);
  } catch {
    return null; // navigazione privata o memoria bloccata: si va avanti senza avviso
  }
}

type Riga = {
  r: RigaScontrino;
  auto: string | null | undefined; // prodotto riconosciuto da solo; undefined = sconosciuto
  nuovo: boolean; // codice mai visto, abbinato solo dal nome: va mostrato una volta
  v: VoceSpesa | null; // prodotto in uso, con le correzioni
  quanto: { q: number; stimata: boolean } | null;
};

// Il lettore del documento di consegna serve solo se il piano ha le regole per riconoscerne le righe.
const CON_DOCUMENTO = piano.scontrino.length > 0;

/** "Spesa arrivata": dal documento di consegna Esselunga, se il piano lo legge, o a mano toccando quello che non è
 *  arrivato. arrivati = quanto è arrivato per prodotto; impara = articoli che hai sistemato tu (prodotto e peso). */
export default function ArrivoSpesa({
  inArrivo,
  compri,
  nomi,
  onConferma,
  onAnnulla,
}: {
  inArrivo: VoceSpesa[];
  compri: (v: VoceSpesa) => number;
  nomi: Record<string, NomeArticolo>;
  onConferma: (arrivati: Record<string, number>, mancanti: string[], impara: Record<string, NomeArticolo>) => void;
  onAnnulla: () => void;
}) {
  const [mancanti, setMancanti] = useState<Set<string>>(new Set());
  const [doc, setDoc] = useState<Documento | null>(null);
  const [giaCaricato, setGiaCaricato] = useState(false);
  const [lettura, setLettura] = useState<string | null>(null); // "…" mentre legge, se no l'errore
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [pesi, setPesi] = useState<Record<string, string>>({});

  async function carica(file: File | undefined) {
    if (!file) return;
    setLettura("…");
    try {
      const d = await leggiDocumento(file);
      if (!d.righe.length) throw new Error("non trovo articoli. È il documento di consegna di Esselunga?");
      setDoc(d);
      setGiaCaricato(ultimoDocumento() === impronta(d));
      setLettura(null);
    } catch (e) {
      setLettura(`Non riesco a leggerlo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const righe: Riga[] = (doc?.righe ?? []).map((r) => {
    const auto = prodottoRiga(r, nomi);
    const id = r.codice in scelte ? scelte[r.codice] || null : (auto ?? null);
    const v = id ? voci.get(id)! : null;
    // Il peso di una confezione: quello che hai scritto tu per quel codice, se no quello già noto.
    const peso = nomi[r.codice]?.grammi ?? piano.articoli[r.codice];
    const nuovo = !!auto && !(r.codice in nomi) && !(r.codice in piano.articoli);
    return { r, auto, nuovo, v, quanto: v && r.consegnata ? quantitaRiga(r, v, peso) : null };
  });
  // Da guardare: le righe sconosciute e la carne senza peso scritto, che serve alle porzioni.
  const daControllare = righe.filter(
    (x) => x.r.consegnata && (x.auto === undefined || (x.v?.tieni && x.quanto?.stimata))
  );
  const nonConsegnate = righe.filter((x) => !x.r.consegnata);
  const resto = righe.filter((x) => x.r.consegnata && !daControllare.includes(x));
  // Abbinati dal nome per la prima volta: restano in vista, perché una parola può ingannare ("petto di tacchino").
  const nuove = resto.filter((x) => x.nuovo);
  const riconosciute = resto.filter((x) => x.v && !x.nuovo);
  const fuoriLista = resto.filter((x) => !x.v && !x.nuovo);

  function conferma() {
    if (!doc) {
      const arrivati = inArrivo.filter((v) => !mancanti.has(v.id)).map((v) => [v.id, compri(v)]);
      return onConferma(Object.fromEntries(arrivati), [...mancanti], {});
    }
    const arrivati: Record<string, number> = {};
    const manca = new Set<string>();
    const impara: Record<string, NomeArticolo> = {};
    for (const { r, auto, nuovo, v, quanto } of righe) {
      const scritto = Number(pesi[r.codice]) || 0;
      // Si ricorda le righe che hai sistemato o visto tu: quelle che non conosceva, quelle abbinate dal nome per la
      // prima volta, quelle corrette e i pesi scritti a mano.
      if (auto === undefined || nuovo || (r.codice in scelte && (scelte[r.codice] || null) !== auto) || scritto) {
        const grammi = scritto ? scritto / confezioniRiga(r) : (nomi[r.codice]?.grammi ?? null);
        impara[r.codice] = { prodotto: v?.id ?? "", grammi };
      }
      if (!v) continue;
      if (!r.consegnata) manca.add(v.id);
      else arrivati[v.id] = (arrivati[v.id] ?? 0) + (scritto || quanto!.q);
    }
    for (const id of Object.keys(arrivati)) manca.delete(id);
    ultimoDocumento(impronta(doc));
    onConferma(arrivati, [...manca], impara);
  }

  const riga = (x: Riga) => (
    <RigaDoc
      key={x.r.codice + x.r.consegnata}
      x={x}
      peso={pesi[x.r.codice]}
      onProdotto={(id) => setScelte({ ...scelte, [x.r.codice]: id })}
      onPeso={(g) => setPesi({ ...pesi, [x.r.codice]: g })}
    />
  );

  return (
    <section className="card mt-4 p-5" aria-label="Spesa arrivata">
      <p className="font-semibold">Com&apos;è andata la consegna?</p>
      {!doc ? (
        <>
          {CON_DOCUMENTO && (
            <label className={`btn-ghost mt-3 w-full cursor-pointer ${lettura === "…" ? "opacity-50" : ""}`}>
              <FileText className="h-5 w-5" /> {lettura === "…" ? "Leggo il documento…" : "Carica il documento di consegna"}
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                disabled={lettura === "…"}
                onChange={(e) => carica(e.target.files?.[0])}
              />
            </label>
          )}
          {lettura && lettura !== "…" && (
            <p role="alert" className="mt-2 text-sm text-fat">
              {lettura}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {CON_DOCUMENTO
              ? "È il PDF che ti manda Esselunga: lo leggo sul telefono e capisco cosa è arrivato e quanto pesa. Oppure tocca qui sotto quello che non ti hanno consegnato."
              : "Tocca qui sotto quello che non è arrivato: il resto lo conto come comprato."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {inArrivo.map((v) => {
              const manca = mancanti.has(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={manca}
                  onClick={() => {
                    const n = new Set(mancanti);
                    if (!n.delete(v.id)) n.add(v.id);
                    setMancanti(n);
                  }}
                  className={`chip ${manca ? "border-fat bg-fat-soft text-fat line-through" : ""}`}
                >
                  {v.nome}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Documento{doc.data && ` di ${dataLunga(doc.data)}`}: {righe.filter((x) => x.r.consegnata).length} articoli
            consegnati. Controlla e conferma.
          </p>
          {giaCaricato && (
            <p role="alert" className="mt-3 rounded-2xl bg-fat-soft px-4 py-3 text-sm text-fat">
              Questo documento l&apos;hai già caricato. Se confermi di nuovo, le scorte si sommano un&apos;altra volta.
            </p>
          )}
          {nonConsegnate.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold text-fat">Non consegnato</p>
              <ul className="divide-y divide-line">{nonConsegnate.map(riga)}</ul>
            </>
          )}
          {daControllare.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">Da controllare</p>
              <p className="text-xs text-muted">
                Dimmi cos&apos;è e scrivi il peso della carne che il documento non riporta. Prodotto e peso me li
                ricordo per quell&apos;articolo.
              </p>
              <ul className="divide-y divide-line">{daControllare.map(riga)}</ul>
            </>
          )}
          {nuove.length > 0 && (
            <details className="mt-3" open>
              <summary className="cursor-pointer text-sm font-semibold">Nuovi articoli ({nuove.length})</summary>
              <p className="text-xs text-muted">
                Li ho abbinati dal nome: correggi quelli sbagliati. Dalla prossima volta li riconosco dal codice.
              </p>
              <ul className="divide-y divide-line">{nuove.map(riga)}</ul>
            </details>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">Riconosciuti ({riconosciute.length})</summary>
            <ul className="divide-y divide-line">{riconosciute.map(riga)}</ul>
          </details>
          {fuoriLista.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Fuori lista ({fuoriLista.length})</summary>
              <ul className="divide-y divide-line">{fuoriLista.map(riga)}</ul>
            </details>
          )}
        </>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={conferma}>
          {doc ? "Conferma" : mancanti.size ? "Arrivato il resto" : "Arrivato tutto"}
        </button>
        <button type="button" className="btn-ghost flex-1" onClick={onAnnulla}>
          Annulla
        </button>
      </div>
    </section>
  );
}

function RigaDoc({
  x,
  peso,
  onProdotto,
  onPeso,
}: {
  x: Riga;
  peso: string | undefined;
  onProdotto: (id: string) => void;
  onPeso: (g: string) => void;
}) {
  const { r, v, quanto } = x;
  return (
    <li className="py-2">
      <p className="text-xs text-muted">
        {r.descrizione} · {r.qta}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={v?.id ?? ""}
          onChange={(e) => onProdotto(e.target.value)}
          aria-label={`Prodotto della lista per ${r.descrizione}`}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-2 py-1.5 text-sm font-semibold"
        >
          <option value="">Non è nella lista</option>
          {piano.spesa.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
        {v && quanto && quanto.stimata && v.pezzo !== 1 ? (
          <label className="flex shrink-0 items-center gap-1 text-sm">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={peso ?? String(quanto.q)}
              onChange={(e) => onPeso(e.target.value)}
              aria-label={`Peso di ${r.descrizione} in grammi`}
              className="w-20 rounded-xl border border-line bg-card px-2 py-1.5 text-right"
            />
            g
          </label>
        ) : (
          v &&
          quanto && (
            <span className="shrink-0 text-sm text-muted">
              {quanto.stimata ? "~" : ""}
              {quantoMostrare(v, quanto.q, true)}
            </span>
          )
        )}
      </div>
    </li>
  );
}
