"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { giorniSedute } from "@/lib/allenamento";
import type { NomeArticolo } from "@/lib/scontrino";
import {
  consumoFra,
  consumoFuoriPasto,
  giorniDa,
  mancaDa,
  fabbisognoSettimana,
  primaMancanza,
  type FuoriPasto,
  type Momento,
  type Scorta,
} from "@/lib/scorte";
import { createClient } from "@/lib/supabase/client";
import {
  adessoNelFuso,
  aggiungiGiorni,
  giornoDelPiano,
  giorniDelMese,
  indiceGiorno,
  lunediDi,
  minutiDa,
  pastiDelGiorno,
  piano,
  usaProfilo,
  type PastoId,
  type Preferenze,
  type Profilo,
} from "@/lib/piano";
import { ricettaDi } from "@/lib/promemoria";

/** saltati = nomi degli ingredienti che non hai mangiato: escono da kcal, proteine e consumo delle scorte. */
export type StatoPasto = { ricetta: string | null; fatto: boolean; saltati: string[] };
/** allenamenti = giorni delle sedute fatte; spostate = giorni delle sedute se li hai spostati (null = i soliti). */
export type DatiSettimana = { pasti: Record<string, StatoPasto>; allenamenti: string[]; spostate: string[] | null };
/** "da_congelare" = arrivato, da porzionare; "manca" = ordinato ma non arrivato: i pasti che lo usano lo segnalano
 *  finché non lo ricompri. Quanto ne hai in casa sta nelle scorte (useScorte). */
export type StatoSpesa = "da_congelare" | "manca";

const VUOTA: DatiSettimana = { pasti: {}, allenamenti: [], spostate: null };
export const chiavePasto = (giorno: string, pasto: PastoId) => `${giorno}|${pasto}`;

/** I pasti di un giorno con la ricetta in uso (scelta, o proposta con quello che hai) e se sono stati mangiati. */
export function pastiCon(giorno: string, dati: DatiSettimana | null, manca?: (id: string) => boolean) {
  return pastiDelGiorno(giorno).map((p) => {
    const stato = dati?.pasti[chiavePasto(giorno, p.id)];
    const rid = ricettaDi(giorno, p, () => stato?.ricetta, manca);
    return { ...p, rid, ricetta: piano.ricette[rid], fatto: !!stato?.fatto, saltati: stato?.saltati ?? [] };
  });
}

// Quello che si legge dal database resta anche in questo browser: riaprendo l'app compare subito l'ultimo stato
// noto, senza aspettare la rete, poi si riallinea. Sono i dati di chi era collegato: login e logout li svuotano.
const MEMORIA = "dieta:dati:";

function ricordato<T>(chiave: string): T | null {
  if (typeof document === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(MEMORIA + chiave) ?? "null");
  } catch {
    return null;
  }
}

function ricorda(chiave: string, valore: unknown) {
  try {
    localStorage.setItem(MEMORIA + chiave, JSON.stringify(valore));
  } catch {
    // Memoria del browser piena o spenta: alla prossima apertura si aspetta il database, come prima.
  }
}

export function dimenticaDati() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(MEMORIA)) localStorage.removeItem(k);
  } catch {
    // Senza memoria del browser non c'è niente da svuotare.
  }
}

// Cache di modulo: cambiando scheda i dati già letti compaiono subito, poi si riallineano col DB.
const settimane = new Map<string, DatiSettimana>();
let spesaCache = ricordato<Record<string, StatoSpesa>>("spesa");

function settimana(lunedi: string) {
  const salvata = settimane.get(lunedi) ?? ricordato<DatiSettimana>(`settimana:${lunedi}`);
  if (salvata) settimane.set(lunedi, salvata);
  return salvata;
}

function tieniSettimana(lunedi: string, dati: DatiSettimana) {
  settimane.set(lunedi, dati);
  ricorda(`settimana:${lunedi}`, dati);
}

async function userId() {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Il profilo dell'utente collegato, dal database. Senza riga valgono il piano predefinito e nessuna preferenza. */
export async function leggiProfilo(): Promise<Profilo> {
  const { data, error } = await createClient().from("profili").select("piano,preferenze").maybeSingle();
  if (error) throw new Error(error.message);
  return { piano: data?.piano ?? "", preferenze: data?.preferenze ?? {} };
}

/** Salva le preferenze e le applica subito. Il piano della riga non si tocca; se la riga non c'è nasce col predefinito. */
export async function salvaPreferenze(preferenze: Preferenze) {
  const { data, error } = await createClient()
    .from("profili")
    .upsert({ user_id: await userId(), preferenze })
    .select("piano,preferenze")
    .single();
  if (error) throw new Error(error.message);
  // Si tiene la riga come la restituisce il database: è quella che AppShell confronta al prossimo avvio.
  usaProfilo({ piano: data.piano, preferenze: data.preferenze });
}

/** Data e minuti di adesso (nel fuso del piano), aggiornati ogni minuto. null al primo render, per non
 *  disallineare l'HTML del server da quello del telefono. */
export function useAdesso() {
  const [adesso, setAdesso] = useState<ReturnType<typeof adessoNelFuso> | null>(null);
  useEffect(() => {
    const tick = () => setAdesso(adessoNelFuso());
    const primo = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(primo);
      clearInterval(id);
    };
  }, []);
  return adesso;
}

export function useSettimana(lunedi: string | null) {
  // Lo stato ricorda di quale settimana sono i dati: cambiando settimana si parte dalla cache.
  const [stato, setStato] = useState<{ lunedi: string; dati: DatiSettimana } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const dati = lunedi ? (stato?.lunedi === lunedi ? stato.dati : (settimana(lunedi) ?? null)) : null;
  const setDati = useCallback((d: DatiSettimana) => lunedi && setStato({ lunedi, dati: d }), [lunedi]);

  useEffect(() => {
    if (!lunedi) return;
    let vivo = true;
    const sb = createClient();
    const fine = aggiungiGiorni(lunedi, 6);
    Promise.all([
      sb.from("pasti").select("giorno,pasto,ricetta,fatto,saltati").gte("giorno", lunedi).lte("giorno", fine),
      sb.from("allenamenti").select("giorno").gte("giorno", lunedi).lte("giorno", fine),
      sb.from("sedute_spostate").select("giorni").eq("lunedi", lunedi).maybeSingle(),
    ]).then(([p, a, s]) => {
      if (!vivo) return;
      if (p.error || a.error) {
        setErrore((p.error ?? a.error)!.message);
        return;
      }
      const letti: DatiSettimana = {
        pasti: Object.fromEntries(
          p.data.map((r) => [chiavePasto(r.giorno, r.pasto), { ricetta: r.ricetta, fatto: r.fatto, saltati: r.saltati }])
        ),
        allenamenti: a.data.map((r) => r.giorno),
        // Se non si leggono (tabella non ancora creata) valgono i giorni soliti: l'errore esce solo spostando.
        spostate: s.data?.giorni ?? null,
      };
      tieniSettimana(lunedi, letti);
      setDati(letti);
    });
    return () => {
      vivo = false;
    };
  }, [lunedi, setDati]);

  const salvaPasto = useCallback(
    async (giorno: string, pasto: PastoId, modifica: Partial<StatoPasto>) => {
      if (!lunedi) return;
      const corrente = settimana(lunedi) ?? VUOTA;
      const k = chiavePasto(giorno, pasto);
      const prima: StatoPasto | undefined = corrente.pasti[k];
      const nuovo = { ...(prima ?? { ricetta: null, fatto: false, saltati: [] }), ...modifica };
      const next = { ...corrente, pasti: { ...corrente.pasti, [k]: nuovo } };
      tieniSettimana(lunedi, next);
      setDati(next);
      const { error } = await createClient()
        .from("pasti")
        .upsert({ user_id: await userId(), giorno, pasto, ricetta: nuovo.ricetta, fatto: nuovo.fatto, saltati: nuovo.saltati });
      if (error) setErrore(error.message);
    },
    [lunedi, setDati]
  );

  const segnaAllenamento = useCallback(
    async (giorno: string) => {
      if (!lunedi) return;
      const corrente = settimana(lunedi) ?? VUOTA;
      const fatto = corrente.allenamenti.includes(giorno);
      const next = {
        ...corrente,
        allenamenti: fatto ? corrente.allenamenti.filter((g) => g !== giorno) : [...corrente.allenamenti, giorno],
      };
      tieniSettimana(lunedi, next);
      setDati(next);
      const sb = createClient();
      const { error } = fatto
        ? await sb.from("allenamenti").delete().eq("giorno", giorno)
        : await sb.from("allenamenti").insert({ user_id: await userId(), giorno });
      if (error) setErrore(error.message);
    },
    [lunedi, setDati]
  );

  /** Sposta la seduta del giorno "da" al giorno "a", solo per questa settimana. */
  const spostaSeduta = useCallback(
    async (da: string, a: string) => {
      if (!lunedi) return;
      const corrente = settimana(lunedi) ?? VUOTA;
      const giorni = giorniSedute(lunedi, corrente.spostate)
        .map((g) => (g === da ? a : g))
        .sort();
      const next = { ...corrente, spostate: giorni };
      tieniSettimana(lunedi, next);
      setDati(next);
      const { error } = await createClient()
        .from("sedute_spostate")
        .upsert({ user_id: await userId(), lunedi, giorni });
      if (error) setErrore(error.message);
    },
    [lunedi, setDati]
  );

  return { dati, errore, salvaPasto, segnaAllenamento, spostaSeduta };
}

/** Un sacchetto da congelare: quanto ne usano i pasti di un giorno (YYYY-MM-DD). */
export type Porzione = { g: number; giorno: string };

/** Carne e pane da porzionare all'arrivo della spesa: per prodotto, un sacchetto per giorno, con quanto ne usano
 *  le ricette in uso (scelte o proposte dalla rotazione) nei pasti dei prossimi 7 giorni. */
export function usePorzioni(adesso: { data: string; minuti: number } | null, manca?: (id: string) => boolean) {
  const inizio = adesso && giornoDelPiano(adesso.data);
  const lunedi = inizio && lunediDi(inizio);
  const prima = useSettimana(lunedi);
  const dopo = useSettimana(lunedi && aggiungiGiorni(lunedi, 7));
  if (!adesso || !inizio) return null;

  const porzioni: Record<string, Porzione[]> = {};
  const congela = new Set(piano.spesa.filter((v) => v.tieni).map((v) => v.id));
  for (let i = 0; i <= 7; i++) {
    const giorno = aggiungiGiorni(inizio, i);
    const dati = indiceGiorno(inizio) + i < 7 ? prima.dati : dopo.dati;
    for (const p of pastiCon(giorno, dati, manca)) {
      // Ogni pasto della settimana una volta: se oggi è già passato, conta lo stesso pasto fra 7 giorni.
      const passato = inizio === adesso.data && minutiDa(p.ora) <= adesso.minuti;
      if (i === 7 ? !passato : i === 0 && passato) continue;
      for (const [prodotto, g] of Object.entries(p.ricetta.prodotti)) {
        if (!congela.has(prodotto)) continue;
        const lista = (porzioni[prodotto] ??= []);
        const ultima = lista[lista.length - 1];
        if (ultima?.giorno === giorno) ultima.g += g;
        else lista.push({ g, giorno });
      }
    }
  }
  return porzioni;
}

const NESSUNO: FuoriPasto[] = [];

/** letto = righe arrivate, o non servono (giorno null). */
export function useFuoriPasto(giorno: string | null) {
  const lunedi = giorno && lunediDi(giorno);
  const [stato, setStato] = useState<{ lunedi: string; righe: FuoriPasto[] } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const settimana = lunedi && stato?.lunedi === lunedi ? stato.righe : NESSUNO;
  const righe = useMemo(() => settimana.filter((r) => r.giorno === giorno), [settimana, giorno]);

  useEffect(() => {
    if (!lunedi) return;
    let vivo = true;
    createClient()
      .from("fuori_pasto")
      .select("id,giorno,cibo,quando")
      .gte("giorno", lunedi)
      .lte("giorno", aggiungiGiorni(lunedi, 6))
      .order("id")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) return setErrore(error.message);
        setStato({ lunedi, righe: data });
      });
    return () => {
      vivo = false;
    };
  }, [lunedi]);

  // Si mostra dopo il salvataggio: serve l'id della riga per poterla togliere.
  const aggiungi = useCallback(
    async (cibo: string) => {
      if (!giorno || !lunedi) return;
      const { data, error } = await createClient()
        .from("fuori_pasto")
        .insert({ user_id: await userId(), giorno, cibo })
        .select("id,giorno,cibo,quando")
        .single();
      if (error) return setErrore(error.message);
      setStato((s) => ({ lunedi, righe: [...(s?.lunedi === lunedi ? s.righe : []), data] }));
    },
    [giorno, lunedi]
  );

  const togli = useCallback(
    async (cibo: string) => {
      const ultima = righe.findLast((r) => r.cibo === cibo);
      if (!lunedi || !ultima) return;
      setStato({ lunedi, righe: settimana.filter((r) => r !== ultima) });
      const { error } = await createClient().from("fuori_pasto").delete().eq("id", ultima.id);
      if (error) setErrore(error.message);
    },
    [lunedi, righe, settimana]
  );

  return { righe, settimana, letto: !lunedi || stato?.lunedi === lunedi || !!errore, errore, aggiungi, togli };
}

export type DatiMese ={ fatti: Record<string, number>; allenamenti: string[] };
const mesi = new Map<string, DatiMese>();

/** Per il calendario: quanti pasti hai fatto in ogni giorno del mese (YYYY-MM) e in quali giorni ti sei allenato. */
export function useMese(mese: string) {
  const [stato, setStato] = useState<{ mese: string; dati: DatiMese } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const dati = stato?.mese === mese ? stato.dati : (mesi.get(mese) ?? null);

  useEffect(() => {
    let vivo = true;
    const sb = createClient();
    const giorni = giorniDelMese(mese);
    const [primo, ultimo] = [giorni[0], giorni[giorni.length - 1]];
    Promise.all([
      sb.from("pasti").select("giorno,pasto").eq("fatto", true).gte("giorno", primo).lte("giorno", ultimo),
      sb.from("allenamenti").select("giorno").gte("giorno", primo).lte("giorno", ultimo),
    ]).then(([p, a]) => {
      if (!vivo) return;
      if (p.error || a.error) return setErrore((p.error ?? a.error)!.message);
      const fatti: Record<string, number> = {};
      for (const r of p.data) {
        // Conta solo i pasti che quel giorno prevede: una riga con un nome di pasto sconosciuto non gonfia il conto.
        if (pastiDelGiorno(r.giorno).some((s) => s.id === r.pasto)) fatti[r.giorno] = (fatti[r.giorno] ?? 0) + 1;
      }
      const letti = { fatti, allenamenti: a.data.map((r) => r.giorno as string) };
      mesi.set(mese, letti);
      setStato({ mese, dati: letti });
    });
    return () => {
      vivo = false;
    };
  }, [mese]);

  return { dati, errore };
}

export function useSpesa() {
  const [stato, setStato] = useState<Record<string, StatoSpesa> | null>(spesaCache);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("spesa")
      .select("prodotto,stato")
      .then(({ data, error }) => {
        if (error) return setErrore(error.message);
        spesaCache = Object.fromEntries(data.map((r) => [r.prodotto, r.stato as StatoSpesa]));
        ricorda("spesa", spesaCache);
        setStato(spesaCache);
      });
  }, []);

  /** Cambia lo stato di uno o più prodotti insieme; null = torna da comprare. */
  const imposta = useCallback(async (cambi: Record<string, StatoSpesa | null>) => {
    const next = { ...spesaCache };
    for (const [prodotto, nuovo] of Object.entries(cambi)) {
      if (nuovo) next[prodotto] = nuovo;
      else delete next[prodotto];
    }
    spesaCache = next;
    ricorda("spesa", next);
    setStato(next);
    const sb = createClient();
    const uid = await userId();
    const righe = Object.entries(cambi).flatMap(([prodotto, stato]) => (stato ? [{ user_id: uid, prodotto, stato }] : []));
    const tolti = Object.keys(cambi).filter((p) => !cambi[p]);
    const [su, giu] = await Promise.all([
      righe.length ? sb.from("spesa").upsert(righe) : null,
      tolti.length ? sb.from("spesa").delete().in("prodotto", tolti) : null,
    ]);
    const error = su?.error ?? giu?.error;
    if (error) setErrore(error.message);
  }, []);

  return { stato, errore, imposta };
}

let scorteCache = ricordato<Record<string, Scorta>>("scorte");
// Le ricette scelte e i cibi fuori pasto da cui si stimano le scorte (useScorte), come coppie chiave-valore.
let scelteCache = ricordato<[string, StatoPasto][]>("scelte");
let fuoriCache = ricordato<FuoriPasto[]>("fuori");

async function leggiScorte() {
  const { data, error } = await createClient().from("scorte").select("prodotto,quantita,dal");
  if (error) throw new Error(error.message);
  const lette: Record<string, Scorta> = Object.fromEntries(
    data.map((r) => [r.prodotto, { quantita: r.quantita, dal: r.dal }])
  );
  scorteCache = lette;
  ricorda("scorte", lette);
  return lette;
}

/** Cosa non hai (mancaDa), con lo stato della spesa di useSpesa: per proporre e segnalare i pasti. */
export function useManca(spesa: Record<string, StatoSpesa> | null, oggi: string | null) {
  const [scorte, setScorte] = useState(scorteCache);
  useEffect(() => {
    // Se le scorte non si leggono vale solo il "non arrivato": l'errore lo mostra la pagina Spesa.
    leggiScorte().then(setScorte, () => {});
  }, []);
  return useMemo(() => mancaDa(spesa, scorte, oggi ?? ""), [spesa, scorte, oggi]);
}

/** Quanto hai in casa di ogni prodotto: l'ultima quantità nota (consegna o correzione), meno quello che i pasti del
 *  piano hanno usato da allora. "spesa" è lo stato di useSpesa: serve a sapere quali ricette usano i pasti. */
export function useScorte(adesso: Momento | null, spesa: Record<string, StatoSpesa> | null) {
  const [scorte, setScorte] = useState(scorteCache);
  const [scelte, setScelte] = useState<Map<string, StatoPasto> | null>(() => scelteCache && new Map(scelteCache));
  const [fuori, setFuori] = useState<FuoriPasto[]>(() => fuoriCache ?? []);
  const [errore, setErrore] = useState<string | null>(null);
  const manca = useMemo(() => mancaDa(spesa, scorte, adesso?.data ?? ""), [spesa, scorte, adesso?.data]);

  useEffect(() => {
    leggiScorte()
      .then(async (lette) => {
        setScorte(lette);
        // Le ricette scelte servono dal giorno della scorta più vecchia: le altre vengono dalla rotazione.
        const primo = Object.values(lette).map((s) => adessoNelFuso(new Date(s.dal)).data).sort()[0];
        if (!primo) return setScelte(new Map());
        const sb = createClient();
        const [p, f] = await Promise.all([
          sb.from("pasti").select("giorno,pasto,ricetta,fatto,saltati").gte("giorno", primo),
          sb.from("fuori_pasto").select("id,giorno,cibo,quando").gte("giorno", primo),
        ]);
        if (p.error) return setErrore(p.error.message);
        scelteCache = p.data.map((r) => [chiavePasto(r.giorno, r.pasto), { ricetta: r.ricetta, fatto: r.fatto, saltati: r.saltati }]);
        // Senza la tabella (SQL non ancora eseguito) le scorte scendono solo coi pasti: l'errore lo mostra Oggi.
        fuoriCache = f.data ?? [];
        ricorda("scelte", scelteCache);
        ricorda("fuori", fuoriCache);
        setScelte(new Map(scelteCache));
        setFuori(fuoriCache);
      })
      .catch((e: Error) => setErrore(e.message));
  }, []);

  // stima = quanto ne resta adesso; giorni = da quanti giorni vale quella quantità (per i freschi).
  const { stima, giorni } = useMemo(() => {
    const stima: Record<string, number> = {};
    const giorni: Record<string, number> = {};
    if (!scorte || !adesso) return { stima, giorni };
    const consumi = new Map<string, Record<string, number>>(); // un calcolo per ogni momento di partenza
    for (const [id, s] of Object.entries(scorte)) {
      let c = consumi.get(s.dal);
      if (!c) {
        c = consumoFra(
          adessoNelFuso(new Date(s.dal)),
          adesso,
          (d, p) => scelte?.get(chiavePasto(d, p))?.ricetta,
          manca,
          (d, p) => scelte?.get(chiavePasto(d, p))?.saltati,
          (d, p) => !!scelte?.get(chiavePasto(d, p))?.fatto
        );
        for (const [id, q] of Object.entries(consumoFuoriPasto(fuori, s.dal))) c[id] = (c[id] ?? 0) + q;
        consumi.set(s.dal, c);
      }
      stima[id] = Math.max(0, s.quantita - (c[id] ?? 0));
      giorni[id] = giorniDa(s.dal, adesso.data);
    }
    return { stima, giorni };
  }, [scorte, scelte, fuori, adesso, manca]);

  /** Quanto hai adesso di uno o più prodotti: la stima riparte da qui. */
  const imposta = useCallback(async (nuove: Record<string, number>) => {
    const dal = new Date().toISOString();
    const next = { ...scorteCache };
    for (const [id, quantita] of Object.entries(nuove)) next[id] = { quantita, dal };
    scorteCache = next;
    ricorda("scorte", next);
    setScorte(next);
    const uid = await userId();
    const { error } = await createClient()
      .from("scorte")
      .upsert(Object.entries(nuove).map(([prodotto, quantita]) => ({ user_id: uid, prodotto, quantita, dal })));
    if (error) setErrore(error.message);
  }, []);

  // Quando serve la spesa nuova: null finché le scorte non sono lette, o se sei coperto per i prossimi giorni.
  const prossima = useMemo(
    () =>
      scorte && adesso && scelte
        ? primaMancanza(
            adesso,
            spesa,
            scorte,
            stima,
            (d, p) => scelte.get(chiavePasto(d, p))?.ricetta,
            (d, p) => scelte.get(chiavePasto(d, p))?.saltati
          )
        : null,
    [scorte, scelte, stima, adesso, spesa]
  );

  // Quanto usano i pasti della settimana per cui fai la spesa: è quanto serve dei freschi. null finché non si sa.
  const fabbisogno = useMemo(
    () => (adesso && scelte ? fabbisognoSettimana(adesso, (d, p) => scelte.get(chiavePasto(d, p))?.ricetta) : null),
    [adesso, scelte]
  );

  return { stima, giorni, manca, prossima, fabbisogno, pronto: !!scorte, errore, imposta };
}

/** Gli articoli del documento di consegna che hai già sistemato tu: prodotto della lista e peso di una confezione. */
export function useNomiScontrino() {
  const [nomi, setNomi] = useState<Record<string, NomeArticolo>>({});
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("nomi_scontrino")
      .select("codice,prodotto,grammi")
      .then(({ data, error }) => {
        if (error) return setErrore(error.message);
        setNomi(Object.fromEntries(data.map((r) => [r.codice, { prodotto: r.prodotto, grammi: r.grammi }])));
      });
  }, []);

  const impara = useCallback(async (nuovi: Record<string, NomeArticolo>) => {
    setNomi((prima) => ({ ...prima, ...nuovi }));
    const uid = await userId();
    const { error } = await createClient()
      .from("nomi_scontrino")
      .upsert(Object.entries(nuovi).map(([codice, n]) => ({ user_id: uid, codice, ...n })));
    if (error) setErrore(error.message);
  }, []);

  return { nomi, errore, impara };
}
