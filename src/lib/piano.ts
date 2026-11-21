import dati from "@/data/piano.json";
import altriPiani from "@/data/altri-piani";

// piano.json lo genera scripts/build_dieta.py da piano/mio.py: le ricette si cambiano lì, non a mano qui.
// Altri utenti possono avere un piano loro (src/data/altri-piani.ts): vedi usaPiano.
export type PastoId = "colazione" | "pranzo" | "merenda" | "cena" | "dopocena";
export type Ricetta = {
  nome: string;
  ingredienti: [string, string][];
  passi: string[];
  minuti: number;
  kcal: number;
  prot: number;
  /** Quanto usa di ogni prodotto della spesa (grammi o pezzi), per id: porzioni, scongelamento, prodotti mancanti. */
  prodotti: Record<string, number>;
  /** Per ogni ingrediente, nello stesso ordine: kcal, proteine e quanto usa del prodotto della spesa. */
  valori: { kcal: number; prot: number; prodotto?: string; q?: number }[];
  fuori: boolean;
  /** Per quando manca un prodotto: fuori dalla rotazione e dalla spesa fissa, proposta solo se serve. */
  ripiego?: boolean;
  /** Frase mostrata nella pagina del pasto (per i piatti fuori casa, per esempio). */
  nota?: string;
};
export type Esercizio = { nome: string; dettaglio: string; secondi?: number };
export type Allenamento = {
  /** Giorni di ogni settimana, 0 = lunedì, se non li sposti dall'app. */
  giorni: number[];
  ora: string;
  /** "15 minuti, a casa, senza attrezzi" */
  descrizione: string;
  riscaldamento?: Esercizio;
  circuito: Esercizio[];
  /** Cosa fare negli esercizi senza "secondi" ("fino a 1-2 dal cedimento"). */
  ripetizioni: string;
  giri: number;
  /** Secondi di pausa fra un esercizio e l'altro. */
  pausa: number;
  progressione: string[];
};
export type VoceSpesa = {
  id: string;
  reparto: string;
  nome: string;
  serve: string;
  formato: string;
  /** Solo carne e pane, che all'arrivo si porzionano e si congelano: dove resta quello di oggi e di domani. */
  tieni?: string;
  /** Come va in freezer se non a porzioni dei pasti ("interi" per il pane). */
  congela?: string;
  /** Solo quello che sta in freezer: il nome breve dell'avviso della sera prima ("pesce"). */
  scongela?: string;
  /** Quanto serve a settimana e quanto c'è in una confezione, nell'unità delle ricette (pezzi se "pezzo" è 1,
   *  se no grammi; "pezzo" > 1 = grammi di un pezzo, per mostrarli come pezzi). */
  q: number;
  conf: number;
  confNome: string;
  pezzo?: number;
  /** Tonno e legumi: la confezione si conta a scatolette, col peso sgocciolato. */
  sgocciolato?: boolean;
  /** Dura pochi giorni (verdura, banane, affettati, pasta fresca): l'avanzo non vale per la spesa dopo. */
  fresco?: boolean;
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
  /** Fasce di ogni giornata, [minimo, massimo]. */
  obiettivi: { kcal: [number, number]; proteine: [number, number] };
  /** Primo giorno del piano (YYYY-MM-DD, un lunedì). */
  inizio: string;
  /** Fuso orario di pasti e notifiche ("Europe/Rome"). */
  fuso: string;
  /** null = il piano non ha allenamento. */
  allenamento: Allenamento | null;
  /** In ordine di orario; il primo è quello del risveglio. */
  pasti: { id: PastoId; nome: string; ora: string }[];
  settimana: { giorno: string; pasti: Partial<Record<PastoId, string[]>> }[];
  ricette: Record<string, Ricetta>;
  /** Cibi da segnare fuori dai pasti, una porzione per tocco. */
  cibi: Cibo[];
  spesa: VoceSpesa[];
  spesaExtra: { reparto: string; nome: string }[];
  reparti: string[];
  /** Documento di consegna: [espressione sulla descrizione, prodotto], vince la prima che combacia. */
  scontrino: [string, string][];
  /** Codice articolo Esselunga -> quantità di una confezione, nell'unità delle ricette (il documento non la scrive). */
  articoli: Record<string, number>;
  note: { titolo: string; testo: string }[];
  /** Questi tre non stanno nel JSON: li scrive usaPiano dalle preferenze dell'utente. */
  avvisi: { scongela: string; ordina: string; muti: string[] };
  consegna: Consegna | null;
  pause: Pausa[];
};
/** Quando arriva la spesa di solito: giorno (0 = lunedì) e ora. */
export type Consegna = { giorno: number; ora: string };
/** Giorni senza piano, estremi compresi (YYYY-MM-DD); senza "al" la pausa è ancora aperta. */
export type Pausa = { dal: string; al?: string };

/** Quello che l'utente cambia del suo piano dalla pagina Tu. Senza un campo vale il piano. */
export type Preferenze = {
  /** L'ora di un pasto ("HH:MM"), per id. */
  orari?: Partial<Record<PastoId, string>>;
  /** L'ora dell'avviso della sera per lo scongelamento (22:30 se manca) e quella della seduta. */
  scongela?: string;
  allenamento?: string;
  /** Avvisi spenti: l'id di un pasto, "scongela", "allenamento", "spesa". */
  muti?: string[];
  /** La consegna della spesa: il giorno prima, all'ora "ordina" (12:00 se manca), parte l'avviso di ordinarla. */
  consegna?: Consegna;
  ordina?: string;
  /** Le pause, anche quelle finite: servono al conto delle scorte. In pausa niente avvisi, e le scorte non scendono. */
  pause?: Pausa[];
};
/** La riga dell'utente nella tabella profili: quale piano segue ("" = src/data/piano.json, se no un nome di
 *  src/data/altri-piani.ts) e le sue preferenze. */
export type Profilo = { piano: string; preferenze: Preferenze };

const SCONGELA = "22:30";
const ORDINA = "12:00";
export const oraValida = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const dataValida = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v);

/** Sempre lo stesso oggetto: usaPiano ne cambia il contenuto, così lo vede cambiare anche chi lo ha importato. */
export const piano = {} as Piano;
let voci: Map<string, VoceSpesa>;
// Le ricette di ogni pasto in tutta la settimana: un pasto scambiato fra due giorni resta valido.
let perPasto: Map<PastoId, Set<string>>;
let fmtFuso: Intl.DateTimeFormat;

/**
 * Sceglie il piano, ci applica le preferenze dell'utente e ricalcola quello che ne deriva. Nel browser vale per tutta
 * la pagina: parte dal profilo salvato in questo browser (vedi usaProfilo). Sul server il cron lo cambia per ogni
 * utente subito prima dei calcoli sincroni: lì non vale niente di calcolato una volta per modulo, tutto si legge
 * dall'oggetto piano. Le preferenze arrivano dal database: quello che non è un'ora o una data valida si ignora.
 */
export function usaPiano(nome = "", preferenze: Preferenze = {}) {
  for (const k of Object.keys(piano)) delete (piano as Record<string, unknown>)[k];
  // Nome e preferenze li può scrivere l'utente nella sua riga: un nome che non è un piano ("constructor") vale il
  // predefinito, e preferenze che non sono un oggetto (null) valgono nessuna preferenza.
  const pref: Preferenze = preferenze && typeof preferenze === "object" && !Array.isArray(preferenze) ? preferenze : {};
  const base = (Object.hasOwn(altriPiani, nome) ? altriPiani[nome] : dati) as Omit<Piano, "avvisi" | "consegna" | "pause">;
  const c = pref.consegna;
  const ora = (v: unknown, solita: string) => (oraValida(v) ? v : solita);
  const pasti = base.pasti.map((p) => ({ ...p, ora: ora(pref.orari?.[p.id], p.ora) }));
  // I pasti restano in ordine di orario, come li vuole il resto del codice: se no valgono quelli del piano.
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

/** Il profilo salvato in questo browser. null = mai letto dal database (o sul server): AppShell lo legge prima di
 *  disegnare le pagine. */
export function profiloLocale(): Profilo | null {
  if (typeof document === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_PROFILO) ?? "null");
  } catch {
    return null;
  }
}

/** Salva il profilo in questo browser e lo applica: da qui parte la pagina la prossima volta. null lo dimentica. */
export function usaProfilo(p: Profilo | null) {
  try {
    if (p) localStorage.setItem(CHIAVE_PROFILO, JSON.stringify(p));
    else localStorage.removeItem(CHIAVE_PROFILO);
  } catch {
    // Memoria del browser piena o spenta: il profilo vale lo stesso, fino alla prossima ricarica.
  }
  usaPiano(p?.piano, p?.preferenze);
}

{
  const p = profiloLocale();
  usaPiano(p?.piano, p?.preferenze ?? {});
}

/** Kcal, proteine e prodotti di una ricetta senza gli ingredienti che non hai mangiato (per nome). */
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

/** Cosa spostare dal freezer al frigo la sera prima per una ricetta ("pesce"), saltando quello che non hai. */
export const daScongelare = (r: Ricetta, manca: (id: string) => boolean = () => false) =>
  Object.keys(r.prodotti).flatMap((id) => {
    const nome = voci.get(id)?.scongela;
    return nome && !manca(id) ? [nome] : [];
  });

/** I prodotti della ricetta che non hai, per nome ("merluzzo o platessa"). */
export const mancantiDi = (r: Ricetta, manca: (id: string) => boolean) =>
  Object.keys(r.prodotti)
    .filter(manca)
    .map((id) => voci.get(id)!.nome.toLowerCase());

export const ricettaValida = (pasto: PastoId, id: string) => !!perPasto.get(pasto)?.has(id);

/** Le ricette fra cui si sceglie insieme a questa, nel giorno da cui viene: una ricetta arrivata da uno scambio porta
 *  con sé le sue alternative. */
export const sorelleDi = (pasto: PastoId, id: string) =>
  piano.settimana.map((g) => g.pasti[pasto] ?? []).find((o) => o.includes(id)) ?? [id];

/** Data (YYYY-MM-DD) e minuti dalla mezzanotte nel fuso del piano: il server di Vercel gira in UTC. */
export function adessoNelFuso(d = new Date()) {
  const p = Object.fromEntries(fmtFuso.formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, minuti: Number(p.hour) * 60 + Number(p.minute) };
}

// Le date viaggiano come stringhe YYYY-MM-DD; a mezzogiorno UTC nessun fuso le sposta di giorno.
const utc = (data: string) => new Date(`${data}T12:00:00Z`);

export function aggiungiGiorni(data: string, n: number) {
  const d = utc(data);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunedì, 6 = domenica */
export const indiceGiorno = (data: string) => (utc(data).getUTCDay() + 6) % 7;
export const lunediDi = (data: string) => aggiungiGiorni(data, -indiceGiorno(data));
export const giorniDellaSettimana = (lunedi: string) =>
  Array.from({ length: 7 }, (_, i) => aggiungiGiorni(lunedi, i));

/** Il giorno è dentro una pausa: niente avvisi, e delle scorte scende solo quello che segni mangiato. */
export const inPausa = (data: string) => piano.pause.some((p) => p.dal <= data && (!p.al || data <= p.al));

/** La prossima consegna della spesa da "adesso" in poi, come data e minuti. null = l'utente non l'ha detta. */
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

/** Proposta della rotazione: cambia ogni lunedì. La settimana di piano.inizio è la 0, cioè i piatti del PDF. Se il piatto
 *  della rotazione usa qualcosa che non hai ("manca"), vale il primo che dopo di lui puoi fare con quello che hai,
 *  ripieghi compresi, meglio se con la stessa carne o pesce dal freezer: la sera prima l'avviso te l'ha fatto
 *  scongelare. Se non ce n'è nessuno resta quello della rotazione, con il suo "Non hai". */
export function ricettaProposta(data: string, opzioni: string[], manca: (id: string) => boolean = () => false) {
  // I piatti fuori casa si scelgono a mano: la rotazione li salta, a meno che il pasto sia solo quello.
  const cucinati = opzioni.filter((id) => !piano.ricette[id].fuori);
  const giro = cucinati.length ? cucinati : opzioni;
  const rotazione = giro.filter((id) => !piano.ricette[id].ripiego);
  const settimana = Math.floor((utc(data).getTime() - utc(piano.inizio).getTime()) / (7 * 86400000));
  const k = ((settimana % rotazione.length) + rotazione.length) % rotazione.length;
  const ordine = [...rotazione.slice(k), ...rotazione.slice(0, k), ...giro.filter((id) => piano.ricette[id].ripiego)];
  const puoi = ordine.filter((id) => !Object.keys(piano.ricette[id].prodotti).some(manca));
  const freezer = (id: string) => daScongelare(piano.ricette[id]).sort().join();
  return puoi.find((id) => freezer(id) === freezer(rotazione[k])) ?? puoi[0] ?? rotazione[k];
}

/** Il giorno da mostrare di default: oggi, o il primo giorno del piano se non è ancora partito. */
export const giornoDelPiano = (oggi: string) => (oggi < piano.inizio ? piano.inizio : oggi);

export function minutiDa(ora: string) {
  const [h, m] = ora.split(":").map(Number);
  return h * 60 + m;
}

const fmtData = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const fmtBreve = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "short" });

/** "giovedì 12 novembre" */
export const dataLunga = (data: string) => fmtData.format(utc(data));
/** "12 nov" */
export const dataBreve = (data: string) => fmtBreve.format(utc(data));

const fmtMese = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", month: "long", year: "numeric" });

/** "novembre 2026", da un mese scritto YYYY-MM */
export const nomeMese = (mese: string) => fmtMese.format(utc(`${mese}-01`));

/** Il mese (YYYY-MM) che viene n mesi dopo, o prima se n è negativo. */
export function spostaMese(mese: string, n: number) {
  const d = utc(`${mese}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** Tutti i giorni di un mese (YYYY-MM). */
export function giorniDelMese(mese: string) {
  const giorni: string[] = [];
  for (let d = `${mese}-01`; d.startsWith(mese); d = aggiungiGiorni(d, 1)) giorni.push(d);
  return giorni;
}

/** I timer di un passaggio, in minuti: ogni numero seguito da minuto/minuti ("cuoci per 10 minuti"). */
export function minutiNelPasso(passo: string) {
  return [...passo.matchAll(/(\d+)\s*minut[oi]/g)].map((m) => Number(m[1]));
}

// In ordine di precedenza: se una frase nomina più cibi vince il primo della lista (penne prima dei broccoli).
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

/**
 * I timer di un passaggio con un nome che dice cosa stai cuocendo ("Spaghetti", "Patate in forno").
 * Il cibo si cerca prima nel pezzo di frase che precede il numero, poi nel resto della frase, poi nel
 * passaggio intero, infine nel nome della ricetta.
 */
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
