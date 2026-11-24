export type PastoId = "colazione" | "pranzo" | "merenda" | "cena" | "dopocena";
export type Ricetta = {
  nome: string;
  ingredienti: [string, string][];
  passi: string[];
  minuti: number;
  kcal: number;
  prot: number;
  /** id del prodotto della spesa -> quantità usata, in grammi o pezzi. */
  prodotti: Record<string, number>;
  /** Uno per ingrediente, nello stesso ordine. */
  valori: { kcal: number; prot: number; prodotto?: string; q?: number }[];
  fuori: boolean;
  /** Fuori dalla rotazione e dalla spesa fissa: proposta solo se manca un prodotto. */
  ripiego?: boolean;
  nota?: string;
  /** Prodotto -> sostituti in questo piatto, al posto di quelli della voce di spesa; [] = qui nessuno. */
  sostituti?: Record<string, string[]>;
};
export type Esercizio = { nome: string; dettaglio: string; secondi?: number };
export type Allenamento = {
  /** 0 = lunedì. */
  giorni: number[];
  ora: string;
  descrizione: string;
  riscaldamento?: Esercizio;
  circuito: Esercizio[];
  /** Per gli esercizi senza "secondi". */
  ripetizioni: string;
  giri: number;
  /** In secondi. */
  pausa: number;
  progressione: string[];
};
export type VoceSpesa = {
  id: string;
  reparto: string;
  nome: string;
  serve: string;
  formato: string;
  /** Solo per ciò che si porziona e congela all'arrivo: dove tenere la parte di oggi e domani. */
  tieni?: string;
  /** Come congelarlo se non a porzioni dei pasti. */
  congela?: string;
  /** Solo per il freezer: nome breve nell'avviso della sera prima. */
  scongela?: string;
  /** q a settimana, conf per confezione: pezzi se pezzo è 1, se no grammi (pezzo > 1 = grammi di un pezzo). */
  q: number;
  conf: number;
  confNome: string;
  pezzo?: number;
  /** La confezione si conta a scatolette, col peso sgocciolato. */
  sgocciolato?: boolean;
  /** Dura pochi giorni: l'avanzo non vale per la spesa dopo. */
  fresco?: boolean;
  /** Prodotti simili, in ordine: se manca e ne hai uno, usi quello, stessa quantità. Una ricetta può dire i suoi. */
  sostituti?: string[];
};
export type Cibo = {
  id: string;
  nome: string;
  porzione: string;
  kcal: number;
  prot: number;
  prodotti: Record<string, number>;
};
type Piano = {
  /** Per giornata, [minimo, massimo]. */
  obiettivi: { kcal: [number, number]; proteine: [number, number] };
  /** YYYY-MM-DD, un lunedì. */
  inizio: string;
  fuso: string;
  /** null = il piano non ha allenamento. */
  allenamento: Allenamento | null;
  /** In ordine di orario; il primo è quello del risveglio. */
  pasti: { id: PastoId; nome: string; ora: string }[];
  settimana: { giorno: string; pasti: Partial<Record<PastoId, string[]>> }[];
  ricette: Record<string, Ricetta>;
  /** Cibi fuori pasto: un tocco = una porzione. */
  cibi: Cibo[];
  spesa: VoceSpesa[];
  spesaExtra: { reparto: string; nome: string }[];
  reparti: string[];
  /** [espressione sulla descrizione del documento di consegna, prodotto]: vince la prima che combacia. */
  scontrino: [string, string][];
  /** Codice articolo -> quantità di una confezione nell'unità delle ricette: il documento non la scrive. */
  articoli: Record<string, number>;
  note: { titolo: string; testo: string }[];
  /** Questi tre non sono nel JSON: li scrive usaPiano dalle preferenze. */
  avvisi: { scongela: string; ordina: string; muti: string[] };
  consegna: Consegna | null;
  pause: Pausa[];
};
/** giorno: 0 = lunedì. */
export type Consegna = { giorno: number; ora: string };
/** Estremi compresi (YYYY-MM-DD); senza "al" la pausa è ancora aperta. */
export type Pausa = { dal: string; al?: string };

/** Senza un campo vale il piano. */
export type Preferenze = {
  orari?: Partial<Record<PastoId, string>>;
  /** Ore dell'avviso di scongelamento e della seduta. */
  scongela?: string;
  allenamento?: string;
  /** Avvisi spenti: l'id di un pasto, "scongela", "allenamento", "spesa". */
  muti?: string[];
  /** ordina = ora dell'avviso di ordinare, il giorno prima della consegna. */
  consegna?: Consegna;
  ordina?: string;
  /** Anche quelle finite: servono al conto delle scorte. */
  pause?: Pausa[];
};
/** piano: "" = piano.json, se no una chiave di altri-piani. */
export type Profilo = { piano: string; preferenze: Preferenze };
export type DatiPiano = Omit<Piano, "avvisi" | "consegna" | "pause">;
export type PianoSalvato = { versione: string; dati: DatiPiano };

const SCONGELA = "22:30";
const ORDINA = "12:00";
export const oraValida = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const dataValida = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v);

/** Sempre lo stesso oggetto: usaPiano lo muta, così chi lo ha importato vede il cambio. */
export const piano = {} as Piano;
let voci: Map<string, VoceSpesa>;
// Su tutta la settimana: un pasto scambiato fra due giorni resta valido.
let perPasto: Map<PastoId, Set<string>>;
let fmtFuso: Intl.DateTimeFormat;
let base: DatiPiano | null = null;

export const pianoPronto = () => !!base;

/** Sul server il cron lo chiama per ogni utente: niente va calcolato una volta per modulo, si legge da piano. */
export function usaPiano(dati: DatiPiano | null, preferenze: Preferenze = {}) {
  for (const k of Object.keys(piano)) delete (piano as Record<string, unknown>)[k];
  base = dati;
  if (!base) return;
  // Le preferenze vengono dalla riga dell'utente: non sono affidabili.
  const pref: Preferenze = preferenze && typeof preferenze === "object" && !Array.isArray(preferenze) ? preferenze : {};
  const c = pref.consegna;
  const ora = (v: unknown, solita: string) => (oraValida(v) ? v : solita);
  const pasti = base.pasti.map((p) => ({ ...p, ora: ora(pref.orari?.[p.id], p.ora) }));
  // Il resto del codice vuole i pasti in ordine di orario.
  const inOrdine = pasti.every((p, i) => !i || pasti[i - 1].ora < p.ora);
  Object.assign(piano, base, {
    pasti: inOrdine ? pasti : base.pasti,
    allenamento: base.allenamento && { ...base.allenamento, ora: ora(pref.allenamento, base.allenamento.ora) },
    avvisi: {
      scongela: ora(pref.scongela, SCONGELA),
      ordina: ora(pref.ordina, ORDINA),
      muti: Array.isArray(pref.muti) ? pref.muti : [],
    },
    consegna: c && [0, 1, 2, 3, 4, 5, 6].includes(c.giorno) && oraValida(c.ora) ? { giorno: c.giorno, ora: c.ora } : null,
    pause: (Array.isArray(pref.pause) ? pref.pause : []).filter(
      (p) => p && dataValida(p.dal) && (p.al == null || dataValida(p.al))
    ),
  });
  voci = new Map(piano.spesa.map((v) => [v.id, v]));
  perPasto = new Map();
  for (const g of piano.settimana)
    for (const [id, opzioni] of Object.entries(g.pasti) as [PastoId, string[]][])
      opzioni.forEach((o) => perPasto.set(id, (perPasto.get(id) ?? new Set()).add(o)));
  fmtFuso = new Intl.DateTimeFormat("en-CA", {
    timeZone: piano.fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

const CHIAVE_PROFILO = "dieta:profilo";
const CHIAVE_PIANO = "dieta:piano";

function salvato<T>(chiave: string): T | null {
  if (typeof document === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(chiave) ?? "null");
  } catch {
    return null;
  }
}

/** null = mai letto dal database, o sul server. */
export const profiloLocale = () => salvato<Profilo>(CHIAVE_PROFILO);
export const versioneLocale = () => salvato<PianoSalvato>(CHIAVE_PIANO)?.versione ?? "";

/** null cancella profilo e piano salvati nel browser. */
export function usaProfilo(p: (Profilo & Partial<PianoSalvato>) | null) {
  try {
    if (p) {
      localStorage.setItem(CHIAVE_PROFILO, JSON.stringify({ piano: p.piano, preferenze: p.preferenze }));
      if (p.dati) localStorage.setItem(CHIAVE_PIANO, JSON.stringify({ versione: p.versione, dati: p.dati }));
    } else {
      localStorage.removeItem(CHIAVE_PROFILO);
      localStorage.removeItem(CHIAVE_PIANO);
    }
  } catch {
    // Memoria del browser piena o spenta: il profilo vale fino alla ricarica.
  }
  usaPiano(p ? (p.dati ?? base) : null, p?.preferenze);
}

try {
  usaPiano(salvato<PianoSalvato>(CHIAVE_PIANO)?.dati ?? null, profiloLocale()?.preferenze);
} catch {
  // Piano salvato da una versione vecchia: AppShell lo riscarica.
  usaPiano(null);
}

/** saltati = nomi degli ingredienti non mangiati. */
export function senzaSaltati(r: Ricetta, saltati: string[] = []) {
  let { kcal, prot } = r;
  const prodotti = { ...r.prodotti };
  r.ingredienti.forEach(([nome], i) => {
    if (!saltati.includes(nome)) return;
    const v = r.valori[i];
    kcal -= v.kcal;
    prot -= v.prot;
    if (v.prodotto) prodotti[v.prodotto] -= v.q!;
  });
  return { kcal: Math.max(0, Math.round(kcal)), prot: Math.max(0, Math.round(prot)), prodotti };
}

/** Prodotto che mancava -> prodotto usato al suo posto, scelto dall'utente per un pasto. */
export type Scelti = Record<string, string>;

/** Quello scelto per il pasto; se no, il primo sostituto che hai di un prodotto della ricetta che manca. */
export const sostitutoDi = (r: Ricetta, id: string, manca: (id: string) => boolean, scelti: Scelti = {}) =>
  // La scelta la scrive l'utente nella sua riga: vale solo se è un prodotto.
  voci.has(scelti[id])
    ? scelti[id]
    : manca(id)
      ? (r.sostituti?.[id] ?? voci.get(id)?.sostituti)?.find((s) => !manca(s))
      : undefined;

const senzaRimedio = (r: Ricetta, manca: (id: string) => boolean, scelti?: Scelti) => (id: string) =>
  manca(id) && !sostitutoDi(r, id, manca, scelti);

export const daScongelare = (r: Ricetta, manca: (id: string) => boolean = () => false) =>
  Object.keys(r.prodotti).flatMap((id) => {
    const usi = sostitutoDi(r, id, manca) ?? id;
    const nome = voci.get(usi)?.scongela;
    return nome && !manca(usi) ? [nome] : [];
  });

/** Quello che manca e non ha un sostituto in casa. */
export const mancantiDi = (r: Ricetta, manca: (id: string) => boolean, scelti?: Scelti) =>
  Object.keys(r.prodotti)
    .filter(senzaRimedio(r, manca, scelti))
    .map((id) => voci.get(id)!.nome.toLowerCase());

/**
 * Per ogni ingrediente che manca, o sostituito a mano: fra cosa scegliere e cosa conta come usato. Fra le
 * opzioni anche i sostituti del prodotto che la ricetta non propone: l'utente può averli usati lo stesso.
 */
export const sostitutiDi = (r: Ricetta, manca: (id: string) => boolean, scelti: Scelti = {}) =>
  r.ingredienti.flatMap(([nome], i) => {
    const id = r.valori[i].prodotto;
    if (!id || !(manca(id) || voci.has(scelti[id]))) return [];
    const usato = sostitutoDi(r, id, manca, scelti);
    const opzioni = [...new Set([...(r.sostituti?.[id] ?? []), ...(voci.get(id)?.sostituti ?? [])])]
      .filter((s) => !manca(s) || s === usato)
      .map((s) => ({ id: s, nome: voci.get(s)!.nome.toLowerCase() }));
    return opzioni.length ? [{ nome, prodotto: id, opzioni, usato }] : [];
  });

/** [ingrediente che manca, com'è scritto nella ricetta, e cosa usi al suo posto]. */
export const sostituzioniDi = (r: Ricetta, manca: (id: string) => boolean, scelti?: Scelti) =>
  sostitutiDi(r, manca, scelti).flatMap((s): [string, string][] =>
    s.usato ? [[s.nome, voci.get(s.usato)!.nome.toLowerCase()]] : []
  );

export const ricettaValida = (pasto: PastoId, id: string) => !!perPasto.get(pasto)?.has(id);

/** Le alternative del giorno da cui viene la ricetta: uno scambio se le porta dietro. */
export const sorelleDi = (pasto: PastoId, id: string) =>
  piano.settimana.map((g) => g.pasti[pasto] ?? []).find((o) => o.includes(id)) ?? [id];

/** Data e minuti dalla mezzanotte nel fuso del piano: il server gira in UTC. */
export function adessoNelFuso(d = new Date()) {
  const p = Object.fromEntries(fmtFuso.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, minuti: Number(p.hour) * 60 + Number(p.minute) };
}

// A mezzogiorno UTC nessun fuso sposta una data YYYY-MM-DD di giorno.
const utc = (data: string) => new Date(`${data}T12:00:00Z`);

export function aggiungiGiorni(data: string, n: number) {
  const d = utc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunedì. */
export const indiceGiorno = (data: string) => (utc(data).getUTCDay() + 6) % 7;
export const lunediDi = (data: string) => aggiungiGiorni(data, -indiceGiorno(data));
export const giorniDellaSettimana = (lunedi: string) =>
  Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i));

export const inPausa = (data: string) => piano.pause.some((p) => p.dal <= data && (!p.al || data <= p.al));

/** null = l'utente non ha indicato la consegna. */
export function prossimaConsegna(adesso: { data: string; minuti: number }) {
  if (!piano.consegna) return null;
  const minuti = minutiDa(piano.consegna.ora);
  const fra = (piano.consegna.giorno - indiceGiorno(adesso.data) + 7) % 7;
  return { data: aggiungiGiorni(adesso.data, fra === 0 && minuti <= adesso.minuti ? 7 : fra), minuti };
}

export function pastiDelGiorno(data: string) {
  const giorno = piano.settimana[indiceGiorno(data)];
  return piano.pasti.flatMap((s) => {
    const opzioni = giorno.pasti[s.id];
    return opzioni ? [{ ...s, opzioni }] : [];
  });
}

/** Ruota ogni lunedì; se manca qualcosa senza sostituto, il primo fattibile dopo, meglio se con lo stesso scongelato. */
export function ricettaProposta(data: string, opzioni: string[], manca: (id: string) => boolean = () => false) {
  // I piatti fuori casa si scelgono a mano, salvo che il pasto abbia solo quelli.
  const cucinati = opzioni.filter((id) => !piano.ricette[id].fuori);
  const giro = cucinati.length ? cucinati : opzioni;
  const rotazione = giro.filter((id) => !piano.ricette[id].ripiego);
  const settimana = Math.floor((utc(data).getTime() - utc(piano.inizio).getTime()) / (7 * 86400000));
  const k = ((settimana % rotazione.length) + rotazione.length) % rotazione.length;
  const ordine = [...rotazione.slice(k), ...rotazione.slice(0, k), ...giro.filter((id) => piano.ricette[id].ripiego)];
  const puoi = ordine.filter((id) => !Object.keys(piano.ricette[id].prodotti).some(senzaRimedio(piano.ricette[id], manca)));
  const freezer = (id: string) => daScongelare(piano.ricette[id]).sort().join();
  return puoi.find((id) => freezer(id) === freezer(rotazione[k])) ?? puoi[0] ?? rotazione[k];
}

export const giornoDelPiano = (oggi: string) => (oggi < piano.inizio ? piano.inizio : oggi);

export function minutiDa(ora: string) {
  const [h, m] = ora.split(":").map(Number);
  return h * 60 + m;
}

const fmtData = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const fmtBreve = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "short" });

export const dataLunga = (data: string) => fmtData.format(utc(data));
export const dataBreve = (data: string) => fmtBreve.format(utc(data));

const fmtMese = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", month: "long", year: "numeric" });

export const nomeMese = (mese: string) => fmtMese.format(utc(`${mese}-01`));

export function spostaMese(mese: string, n: number) {
  const d = utc(`${mese}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export function giorniDelMese(mese: string) {
  const giorni: string[] = [];
  for (let d = `${mese}-01`; d.startsWith(mese); d = aggiungiGiorni(d, 1)) giorni.push(d);
  return giorni;
}

export function minutiNelPasso(passo: string) {
  return [...passo.matchAll(/(\d+)\s*minut[oi]/g)].map((m) => Number(m[1]));
}

// L'ordine conta: se una frase nomina più cibi vince il primo.
const CIBI: [RegExp, string][] = [
  [/ripos/i, "Riposo"],
  [/occhio di bue/i, "Uova all'occhio"],
  [/strapazzate/i, "Uova strapazzate"],
  [/\bsode\b/i, "Uova sode"],
  [/\brosti\b/i, "Rosti"],
  [/frittata/i, "Frittata"],
  [/cotoletta/i, "Cotoletta"],
  [/hamburger/i, "Hamburger"],
  [/polpettine/i, "Polpettine"],
  [/bocconcini/i, "Bocconcini"],
  [/straccetti/i, "Straccetti"],
  [/pollo|petto/i, "Pollo"],
  [/salsiccia/i, "Salsiccia"],
  [/macinato/i, "Macinato"],
  [/pesce|nasello|merluzzo|salmone/i, "Pesce"],
  [/cartoccio/i, "Cartoccio"],
  [/spaghetti/i, "Spaghetti"],
  [/penne/i, "Penne"],
  [/ditalini/i, "Ditalini"],
  [/tortellini/i, "Tortellini"],
  [/\bpasta\b/i, "Pasta"],
  [/\briso\b/i, "Riso"],
  [/brodo/i, "Brodo"],
  [/broccoli/i, "Broccoli"],
  [/fagiolini/i, "Fagiolini"],
  [/\bfagioli\b/i, "Fagioli"],
  [/\bceci\b/i, "Ceci"],
  [/finocch/i, "Finocchi"],
  [/patate/i, "Patate"],
  [/pomodorini/i, "Pomodorini"],
  [/passata|sugo/i, "Sugo"],
  [/mozzarella/i, "Mozzarella"],
  [/piadina|strisce/i, "Piadina"],
  [/sfilatino/i, "Sfilatino"],
  [/\bpane\b/i, "Pane"],
  [/gratin/i, "Gratin"],
  [/rosmarino/i, "Rosmarino"],
  [/\buov[ao]\b/i, "Uova"],
];

const cibo = (testo: string) => CIBI.find(([re]) => re.test(testo))?.[1];

export function timerNelPasso(passo: string, ricetta: string) {
  const trovati = [...passo.matchAll(/(\d+)\s*minut[oi]/g)];
  return trovati.map((m, k) => {
    const inizio = m.index;
    const fine = inizio + m[0].length;
    const inizioFrase = Math.max(passo.lastIndexOf(".", inizio), passo.lastIndexOf(";", inizio)) + 1;
    const prima = passo.slice(Math.max(inizioFrase, k ? trovati[k - 1].index + trovati[k - 1][0].length : 0), inizio);
    const fineFrase = passo.slice(fine).search(/[.;]/);
    const dopo = passo.slice(fine, Math.min(fineFrase < 0 ? passo.length : fine + fineFrase, trovati[k + 1]?.index ?? passo.length));
    let nome = cibo(prima) ?? cibo(dopo) ?? cibo(passo) ?? cibo(ricetta) ?? ricetta;
    if (/forno|teglia/i.test(prima) && nome !== "Gratin") nome += " in forno";
    else if (/padella|piastra|salta|ripassa/i.test(prima)) nome += " in padella";
    if (/^\s*per lato/.test(passo.slice(fine))) nome += ", per lato";
    else if (/\bgira\b/i.test(prima)) nome += ", secondo lato";
    return { nome, secondi: Number(m[1]) * 60 };
  });
}
