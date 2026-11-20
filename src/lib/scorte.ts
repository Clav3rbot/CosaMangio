import {
  adessoNelFuso,
  aggiungiGiorni,
  minutiDa,
  pastiDelGiorno,
  piano,
  senzaSaltati,
  type PastoId,
  type VoceSpesa,
} from "@/lib/piano";
import { ricettaDi, type Scelta } from "@/lib/promemoria";

export type Momento = { data: string; minuti: number };
export type Scorta = { quantita: number; dal: string };

/** Giorni interi da quando vale una scorta ("dal", un istante) a oggi (YYYY-MM-DD, nel fuso del piano). */
export const giorniDa = (dal: string, oggi: string) =>
  Math.round((Date.parse(oggi) - Date.parse(adessoNelFuso(new Date(dal)).data)) / 86_400_000);

/** Dopo quanti giorni un fresco arrivato con la spesa non si propone più nei pasti: è finito o da buttare. */
export const GIORNI_FRESCO_PASTI = 7;

// Calcolato a ogni chiamata, non una volta per modulo: il cron cambia piano da un utente all'altro (usaPiano).
const fresco = (id: string) => piano.spesa.some((v) => v.id === id && v.fresco);

/** Cosa non hai, per proporre e segnalare i pasti: quello ordinato e non arrivato, quello segnato finito e i freschi
 *  che non sono arrivati con le spese dell'ultima settimana. Dispensa, uova, pane e carne senza scorta si suppongono
 *  in casa, perché potevi averli da prima del documento di consegna: se non ci sono, li segni finiti dalla Spesa.
 *  Senza nessuna scorta (documento mai caricato) vale solo il "non arrivato". */
export function mancaDa(spesa: Record<string, string> | null, scorte: Record<string, Scorta> | null, oggi: string) {
  const tracciate = !!scorte && Object.keys(scorte).length > 0;
  return (id: string) => {
    const s = scorte?.[id];
    if (spesa?.[id] === "manca" || s?.quantita === 0) return true;
    if (!tracciate || !fresco(id)) return false;
    return !s || giorniDa(s.dal, oggi) > GIORNI_FRESCO_PASTI;
  };
}

/** Quanto usano di ogni prodotto i pasti del piano dopo "da" e fino ad "a" compreso, con la ricetta in uso e senza gli
 *  ingredienti che non hai mangiato. Conta i pasti dall'orario, non dalla spunta "mangiato": se la dimentichi la
 *  scorta scende lo stesso. */
export function consumoFra(
  da: Momento,
  a: Momento,
  scelta: Scelta,
  manca?: (id: string) => boolean,
  saltati?: (data: string, pasto: PastoId) => string[] | undefined
) {
  const tot: Record<string, number> = {};
  for (let d = da.data < piano.inizio ? piano.inizio : da.data; d <= a.data; d = aggiungiGiorni(d, 1)) {
    for (const p of pastiDelGiorno(d)) {
      const m = minutiDa(p.ora);
      if ((d === da.data && m <= da.minuti) || (d === a.data && m > a.minuti)) continue;
      const { prodotti } = senzaSaltati(piano.ricette[ricettaDi(d, p, scelta, manca)], saltati?.(d, p.id));
      for (const [id, q] of Object.entries(prodotti)) tot[id] = (tot[id] ?? 0) + q;
    }
  }
  return tot;
}

/** Quando serve la spesa nuova: il primo pasto, da "adesso" in avanti, che non puoi fare con quello che hai, e cosa
 *  è finito per i pasti di quel giorno. "stima" è quanto hai adesso; i pasti usano la ricetta scelta o la proposta, che
 *  cambia da sola quando un prodotto finisce. Finito = non ne resta nemmeno un quarto della dose: le stime ballano di
 *  qualche grammo. I prodotti senza scorta si suppongono in casa, i piatti fuori casa non contano. Null = sei coperto
 *  per "giorni" giorni. */
export function primaMancanza(
  adesso: Momento,
  spesa: Record<string, string> | null,
  scorte: Record<string, Scorta>,
  stima: Record<string, number>,
  scelta: Scelta,
  saltati?: (data: string, pasto: PastoId) => string[] | undefined,
  giorni = 10
) {
  const resta = { ...stima };
  const finiti = new Set<string>();
  let primo: { data: string; pasto: PastoId } | null = null;
  for (let d = adesso.data < piano.inizio ? piano.inizio : adesso.data, n = 0; n < giorni && !primo; d = aggiungiGiorni(d, 1), n++) {
    for (const p of pastiDelGiorno(d)) {
      if (d === adesso.data && minutiDa(p.ora) <= adesso.minuti) continue;
      const manca = mancaDa(
        spesa,
        Object.fromEntries(Object.entries(scorte).map(([id, s]) => [id, { ...s, quantita: resta[id] ?? 0 }])),
        d
      );
      const r = piano.ricette[ricettaDi(d, p, scelta, manca)];
      if (r.fuori) continue;
      for (const [id, q] of Object.entries(senzaSaltati(r, saltati?.(d, p.id)).prodotti)) {
        if (q <= 0) continue;
        if (manca(id) || (id in resta && resta[id] < q / 4)) finiti.add(id);
        if (id in resta) resta[id] = Math.max(0, resta[id] - q);
      }
      if (finiti.size) primo ??= { data: d, pasto: p.id };
    }
  }
  return primo && { ...primo, prodotti: [...finiti] };
}

/** Una porzione segnata fuori dai pasti: il giorno in cui l'hai mangiata e quando l'hai segnata (un istante). */
export type FuoriPasto = { id: number; giorno: string; cibo: string; quando: string };

const cibi = new Map(piano.cibi.map((c) => [c.id, c]));

/** Quanto usano di ogni prodotto i cibi fuori dai pasti dopo "dal" (un istante): segnati dopo, e mangiati quel giorno
 *  o dopo. Un cibo di ieri segnato dopo la consegna era già fuori dalla quantità che la consegna ha scritto. */
export function consumoFuoriPasto(righe: FuoriPasto[], dal: string) {
  const giornoDal = adessoNelFuso(new Date(dal)).data;
  const tot: Record<string, number> = {};
  for (const r of righe) {
    if (Date.parse(r.quando) <= Date.parse(dal) || r.giorno < giornoDal) continue;
    for (const [id, q] of Object.entries(cibi.get(r.cibo)?.prodotti ?? {})) tot[id] = (tot[id] ?? 0) + q;
  }
  return tot;
}

/** Giorni dopo i quali un fresco non conta più: comprato domenica, da giovedì la prossima spesa lo ricompra intero. */
export const GIORNI_FRESCO = 3;

/** Quanto di quello che hai vale per la prossima spesa: tutto, tranne i freschi arrivati da più di GIORNI_FRESCO
 *  giorni, che per allora sono finiti o da buttare. Senza questo l'avanzo si sommerebbe di settimana in settimana. */
export const contaPerSpesa = (v: VoceSpesa, hai: number, giorni: number) =>
  v.fresco && giorni > GIORNI_FRESCO ? 0 : hai;

/** Confezioni da comprare per arrivare a quanto serve in una settimana. */
export const confezioniDaComprare = (v: VoceSpesa, hai: number) => Math.max(0, Math.ceil((v.q - hai) / v.conf));

/** "380 g" arrotondato a 10 g, oppure in pezzi per i prodotti contati a pezzi o con "pezzo". "esatto" = grammi
 *  precisi, anche per frutta e mozzarelle (le righe del documento di consegna). */
export const quantoMostrare = (v: VoceSpesa, q: number, esatto = false) =>
  v.pezzo === 1
    ? `${Math.round(q)}`
    : esatto
      ? `${Math.round(q)} g`
      : v.pezzo
        ? `${Math.round(q / v.pezzo)}`
        : `${Math.round(q / 10) * 10} g`;
