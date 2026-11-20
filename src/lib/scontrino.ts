import { piano, type VoceSpesa } from "@/lib/piano";

/** Una riga del documento di consegna Esselunga: "708017 - POLLO/PETTO FETTE 10+ 0.678 Kg €9.89 ...". */
export type RigaScontrino = { codice: string; descrizione: string; qta: string; consegnata: boolean };
export type Documento = { data: string | null; righe: RigaScontrino[] };

/** Legge il PDF sul telefono: il documento ha nome e indirizzo, e non va mandato a nessuno. */
export async function leggiDocumento(file: Blob): Promise<Documento> {
  // unpdf contiene pdf.js: si scarica solo quando serve.
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const linee: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent();
    // Ricompone le righe della tabella: pezzi alla stessa altezza (±2 punti), letti da sinistra a destra.
    const pezzi = items
      .flatMap((it) => ("str" in it && it.str.trim() ? [{ x: it.transform[4], y: it.transform[5], s: it.str.trim() }] : []))
      .sort((a, b) => b.y - a.y);
    let riga: typeof pezzi = [];
    for (const p of pezzi) {
      if (riga.length && Math.abs(riga[0].y - p.y) > 2) {
        linee.push(riga.sort((a, b) => a.x - b.x).map((q) => q.s).join(" "));
        riga = [];
      }
      riga.push(p);
    }
    if (riga.length) linee.push(riga.sort((a, b) => a.x - b.x).map((q) => q.s).join(" "));
  }
  return interpretaLinee(linee);
}

/** Dalle righe di testo: gli articoli consegnati e quelli non consegnati. Gli omaggi sono gadget e si saltano. */
export function interpretaLinee(linee: string[]): Documento {
  let sezione: "articoli" | "omaggi" | "mancanti" | null = null;
  let data: string | null = null;
  const righe: RigaScontrino[] = [];
  for (const l of linee) {
    const d = l.match(/Documento di consegna del (\d{2})\/(\d{2})\/(\d{4})/i);
    if (d) data = `${d[3]}-${d[2]}-${d[1]}`;
    if (/^ARTICOLI NON CONSEGNATI/i.test(l)) sezione = "mancanti";
    else if (/^ARTICOLI IN OMAGGIO/i.test(l)) sezione = "omaggi";
    else if (/^ARTICOLI\b/i.test(l)) sezione = "articoli";
    // Codice, descrizione, quantità ("2" o "0.678 Kg"), poi i prezzi o la fine della riga.
    const m = l.match(/^(\d{4,8}) - (.+?) (\d+(?:[.,]\d+)? ?Kg|\d+)(?= €| *$)/i);
    if (m && (sezione === "articoli" || sezione === "mancanti")) {
      righe.push({ codice: m[1], descrizione: m[2].trim(), qta: m[3], consegnata: sezione === "articoli" });
    }
  }
  return { data, righe };
}

const regole = piano.scontrino.map(([re, id]) => [new RegExp(re), id] as const);

/** Quello che l'utente ha già sistemato per un codice articolo: il prodotto ("" = non è nella lista) e, se l'ha
 *  scritto, quanto c'è in una confezione. */
export type NomeArticolo = { prodotto: string; grammi: number | null };

/** Il prodotto della lista per una riga: prima quello che l'utente ha già scelto per quel codice, poi le parole
 *  chiave del generatore. undefined = da chiedere. */
export function prodottoRiga(r: RigaScontrino, nomi: Record<string, NomeArticolo>): string | null | undefined {
  if (r.codice in nomi) return nomi[r.codice].prodotto || null;
  return regole.find(([re]) => re.test(r.descrizione.toUpperCase()))?.[1];
}

/** Numero di confezioni della riga (1 se è pesata a kg). */
export const confezioniRiga = (r: RigaScontrino) => (/Kg$/i.test(r.qta) ? 1 : Number(r.qta));

/** Quanto è arrivato, nell'unità delle ricette. "stimata" = il peso non è scritto da nessuna parte: vale la confezione
 *  tipica. "perConfezione" = quanto c'è in una confezione di quell'articolo, se si sa (imparato o in piano.articoli). */
export function quantitaRiga(
  r: RigaScontrino,
  v: VoceSpesa,
  perConfezione = piano.articoli[r.codice]
): { q: number; stimata: boolean } {
  const kg = r.qta.match(/^([\d.,]+) ?Kg$/i);
  if (kg && v.pezzo !== 1) return { q: Math.round(parseFloat(kg[1].replace(",", ".")) * 1000), stimata: false };
  const n = confezioniRiga(r);
  if (perConfezione && v.pezzo !== 1) return { q: n * perConfezione, stimata: false };
  const d = r.descrizione.toUpperCase();
  // "4X100", "75GX2", "80X8", "33X3": il numero più piccolo sono i pezzi, l'altro il peso di un pezzo.
  const per = d.match(/(\d+)\s*G?\s*X\s*(\d+)/);
  const conta = per ? Math.min(+per[1], +per[2]) : Number((d.match(/\bX\s*(\d+)\b/) ?? d.match(/^(\d+)\s+\D/))?.[1] ?? 0);
  const g = d.match(/(\d+(?:[.,]\d+)?)\s*(KG|G)\b/);
  const peso = per ? Math.max(+per[1], +per[2]) : g ? parseFloat(g[1].replace(",", ".")) * (g[2] === "KG" ? 1000 : 1) : 0;

  if (v.pezzo === 1) return conta ? { q: n * conta, stimata: false } : { q: n * v.conf, stimata: true };
  // Tonno e legumi: conta le scatolette, ognuna col suo peso sgocciolato.
  if (v.sgocciolato) return { q: n * (conta || 1) * v.conf, stimata: !conta && !peso };
  if (peso) return { q: n * (conta || 1) * peso, stimata: false };
  return { q: n * v.conf, stimata: true };
}
