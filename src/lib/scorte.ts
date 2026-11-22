import {
  adessoNelFuso,
  aggiungiGiorni,
  inPausa,
  minutiDa,
  pastiDelGiorno,
  piano,
  prossimaConsegna,
  senzaSaltati,
  sostitutoDi,
  type PastoId,
  type VoceSpesa,
} from "@/lib/piano";
import { ricettaDi, type Scelta } from "@/lib/promemoria";

export type Momento = { data: string; minuti: number };
export type Scorta = { quantita: number; dal: string };

/** dal = un istante; oggi = YYYY-MM-DD nel fuso del piano. */
export const giorniDa = (dal: string, oggi: string) =>
  Math.round((Date.parse(oggi) - Date.parse(adessoNelFuso(new Date(dal)).data)) / 86_400_000);

/** Dopo questi giorni un fresco non si propone più nei pasti: è finito o da buttare. */
export const GIORNI_FRESCO_PASTI = 7;

// Non una volta per modulo: il cron cambia piano fra un utente e l'altro.
const fresco = (id: string) => piano.spesa.some((v) => v.id === id && v.fresco);

/** I prodotti senza scorta si suppongono in casa; senza nessuna scorta vale solo il "non arrivato". */
export function mancaDa(spesa: Record<string, string> | null, scorte: Record<string, Scorta> | null, oggi: string) {
  const tracciate = !!scorte && Object.keys(scorte).length > 0;
  return (id: string) => {
    const s = scorte?.[id];
    if (spesa?.[id] === "manca" || s?.quantita === 0) return true;
    if (!tracciate || !fresco(id)) return false;
    return !s || giorniDa(s.dal, oggi) > GIORNI_FRESCO_PASTI;
  };
}

/** Conta i pasti dall'orario; nei giorni passati con qualche spunta, e in pausa, solo quelli segnati. */
export function consumoFra(
  da: Momento,
  a: Momento,
  scelta: Scelta,
  manca?: (id: string) => boolean,
  saltati?: (data: string, pasto: PastoId) => string[] | undefined,
  fatto: (data: string, pasto: PastoId) => boolean = () => false
) {
  const tot: Record<string, number> = {};
  for (let d = da.data < piano.inizio ? piano.inizio : da.data; d <= a.data; d = aggiungiGiorni(d, 1)) {
    const pasti = pastiDelGiorno(d);
    const soloSegnati = inPausa(d) || (d < a.data && pasti.some((p) => fatto(d, p.id)));
    for (const p of pasti) {
      const m = minutiDa(p.ora);
      if ((d === da.data && m <= da.minuti) || (d === a.data && m > a.minuti)) continue;
      if (soloSegnati && !fatto(d, p.id)) continue;
      const r = piano.ricette[ricettaDi(d, p, scelta, manca)];
      for (const [id, q] of Object.entries(senzaSaltati(r, saltati?.(d, p.id)).prodotti)) {
        const usi = (manca && sostitutoDi(r, id, manca)) ?? id;
        tot[usi] = (tot[usi] ?? 0) + q;
      }
    }
  }
  return tot;
}

/** null = coperto per "giorni" giorni; finito = meno di un quarto della dose, perché le stime ballano. */
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
    // In pausa non mangi dal piano.
    for (const p of inPausa(d) ? [] : pastiDelGiorno(d)) {
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
        const usi = sostitutoDi(r, id, manca) ?? id;
        if (manca(usi) || (usi in resta && resta[usi] < q / 4)) finiti.add(usi);
        if (usi in resta) resta[usi] = Math.max(0, resta[usi] - q);
      }
      if (finiti.size) primo ??= { data: d, pasto: p.id };
    }
  }
  return primo && { ...primo, prodotti: [...finiti] };
}

/** giorno = quando l'hai mangiata; quando = l'istante in cui l'hai segnata. */
export type FuoriPasto = { id: number; giorno: string; cibo: string; quando: string };

/** Un cibo di prima di "dal", anche se segnato dopo, è già fuori dalla quantità della scorta. */
export function consumoFuoriPasto(righe: FuoriPasto[], dal: string) {
  const cibi = new Map(piano.cibi.map((c) => [c.id, c]));
  const giornoDal = adessoNelFuso(new Date(dal)).data;
  const tot: Record<string, number> = {};
  for (const r of righe) {
    if (Date.parse(r.quando) <= Date.parse(dal) || r.giorno < giornoDal) continue;
    for (const [id, q] of Object.entries(cibi.get(r.cibo)?.prodotti ?? {})) tot[id] = (tot[id] ?? 0) + q;
  }
  return tot;
}

/** Dopo questi giorni un fresco non conta più per la prossima spesa. */
export const GIORNI_FRESCO = 3;

/** Senza lo zero per i freschi vecchi l'avanzo si sommerebbe di settimana in settimana. */
export const contaPerSpesa = (v: VoceSpesa, hai: number, giorni: number) =>
  v.fresco && giorni > GIORNI_FRESCO ? 0 : hai;

/** 7 giorni dalla prossima consegna; appena passata una consegna, da adesso: è la settimana per cui hai comprato. */
export function fabbisognoSettimana(adesso: Momento, scelta: Scelta) {
  const c = prossimaConsegna(adesso);
  let da = c && Date.parse(c.data) - Date.parse(adesso.data) < 6 * 86_400_000 ? c : adesso;
  if (da.data < piano.inizio) da = { data: piano.inizio, minuti: -1 };
  return consumoFra(da, { data: aggiungiGiorni(da.data, 7), minuti: da.minuti }, scelta);
}

/** v.q copre la settimana più pesante; i freschi non avanzano, quindi per loro vale il fabbisogno, se noto. */
export const quantoServe = (v: VoceSpesa, fabbisogno: Record<string, number> | null) =>
  v.fresco && fabbisogno ? (fabbisogno[v.id] ?? 0) : v.q;

export const confezioniDaComprare = (v: VoceSpesa, hai: number, serve = v.q) =>
  Math.max(0, Math.ceil((serve - hai) / v.conf));

/** esatto = grammi precisi, anche per i prodotti con pezzo > 1. */
export const quantoMostrare = (v: VoceSpesa, q: number, esatto = false) =>
  v.pezzo === 1
    ? `${Math.round(q)}`
    : esatto
      ? `${Math.round(q)} g`
      : v.pezzo
        ? `${Math.round(q / v.pezzo)}`
        : `${Math.round(q / 10) * 10} g`;
