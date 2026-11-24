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
  versioneLocale,
  type DatiPiano,
  type PastoId,
  type Preferenze,
  type Profilo,
  type Scelti,
} from "@/lib/piano";
import { ricettaDi } from "@/lib/promemoria";

/** saltati = nomi degli ingredienti non mangiati; sostituti = cosa hai usato al posto di un prodotto che mancava. */
export type StatoPasto = { ricetta: string | null; fatto: boolean; saltati: string[]; sostituti: Scelti };
/** spostate: null = giorni soliti delle sedute. */
export type DatiSettimana = { pasti: Record<string, StatoPasto>; allenamenti: string[]; spostate: string[] | null };
/** "da_congelare" = arrivato, da porzionare; "manca" = ordinato ma non arrivato. */
export type StatoSpesa = "da_congelare" | "manca";

const VUOTA: DatiSettimana = { pasti: {}, allenamenti: [], spostate: null };
export const chiavePasto = (giorno: string, pasto: PastoId) => `${giorno}|${pasto}`;

export function pastiCon(giorno: string, dati: DatiSettimana | null, manca?: (id: string) => boolean) {
  return pastiDelGiorno(giorno).map((p) => {
    const stato = dati?.pasti[chiavePasto(giorno, p.id)];
    const rid = ricettaDi(giorno, p, () => stato?.ricetta, manca);
    return {
      ...p,
      rid,
      ricetta: piano.ricette[rid],
      fatto: !!stato?.fatto,
      saltati: stato?.saltati ?? [],
      // Manca nei dati ricordati dal browser prima che esistesse.
      sostituti: stato?.sostituti ?? {},
    };
  });
}

// Copia locale del database per mostrare subito l'ultimo stato; login e logout la svuotano.
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
    // Memoria del browser piena o spenta: si aspetterà il database.
  }
}

export function dimenticaDati() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(MEMORIA)) localStorage.removeItem(k);
  } catch {
    // Senza memoria del browser non c'è niente da svuotare.
  }
}

// Cache di modulo: cambiando scheda i dati già letti compaiono subito.
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

// Una lettura partita prima che il database abbia una scelta la sovrascriverebbe con quella vecchia.
const scritture = new Map<string, { partite: number; inCorso: Set<Promise<unknown>> }>();

function scrivi<T>(lunedi: string, scrittura: PromiseLike<T>) {
  const s = scritture.get(lunedi) ?? { partite: 0, inCorso: new Set() };
  scritture.set(lunedi, s);
  s.partite++;
  const p = Promise.resolve(scrittura).finally(() => s.inCorso.delete(p));
  s.inCorso.add(p);
  return p;
}

async function leggiSettimana(lunedi: string) {
  const sb = createClient();
  const fine = aggiungiGiorni(lunedi, 6);
  for (;;) {
    await Promise.allSettled(scritture.get(lunedi)?.inCorso ?? []);
    const partite = scritture.get(lunedi)?.partite ?? 0;
    const letti = await Promise.all([
      sb.from("pasti").select("giorno,pasto,ricetta,fatto,saltati,sostituti").gte("giorno", lunedi).lte("giorno", fine),
      sb.from("allenamenti").select("giorno").gte("giorno", lunedi).lte("giorno", fine),
      sb.from("sedute_spostate").select("giorni").eq("lunedi", lunedi).maybeSingle(),
    ]);
    if ((scritture.get(lunedi)?.partite ?? 0) === partite) return letti;
  }
}

async function userId() {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function leggiProfilo(): Promise<Profilo & { versione: string; dati?: DatiPiano }> {
  const res = await fetch(`/api/piano?v=${versioneLocale()}`);
  if (!res.ok) throw new Error(`profilo non letto (${res.status})`);
  return res.json();
}

/** Non tocca il piano della riga; senza riga nasce col predefinito. */
export async function salvaPreferenze(preferenze: Preferenze) {
  const { data, error } = await createClient()
    .from("profili")
    .upsert({ user_id: await userId(), preferenze })
    .select("piano,preferenze")
    .single();
  if (error) throw new Error(error.message);
  // La riga come la restituisce il database: AppShell la confronta al prossimo avvio.
  usaProfilo({ piano: data.piano, preferenze: data.preferenze });
}

/** null al primo render, per non disallineare l'HTML del server da quello del telefono. */
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
  // Lo stato ricorda la sua settimana: cambiandola si parte dalla cache.
  const [stato, setStato] = useState<{ lunedi: string; dati: DatiSettimana } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const dati = lunedi ? (stato?.lunedi === lunedi ? stato.dati : (settimana(lunedi) ?? null)) : null;
  const setDati = useCallback((d: DatiSettimana) => lunedi && setStato({ lunedi, dati: d }), [lunedi]);

  useEffect(() => {
    if (!lunedi) return;
    let vivo = true;
    leggiSettimana(lunedi).then(([p, a, s]) => {
      if (!vivo) return;
      if (p.error || a.error) {
        setErrore((p.error ?? a.error)!.message);
        return;
      }
      const letti: DatiSettimana = {
        pasti: Object.fromEntries(
          p.data.map((r) => [
            chiavePasto(r.giorno, r.pasto),
            { ricetta: r.ricetta, fatto: r.fatto, saltati: r.saltati, sostituti: r.sostituti },
          ])
        ),
        allenamenti: a.data.map((r) => r.giorno),
        // Senza tabella valgono i giorni soliti: l'errore esce solo spostando.
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
      const nuovo = { ...(prima ?? { ricetta: null, fatto: false, saltati: [], sostituti: {} }), ...modifica };
      const next = { ...corrente, pasti: { ...corrente.pasti, [k]: nuovo } };
      tieniSettimana(lunedi, next);
      setDati(next);
      const { error } = await scrivi(
        lunedi,
        userId().then((user_id) => createClient().from("pasti").upsert({ user_id, giorno, pasto, ...nuovo }))
      );
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
      const { error } = await scrivi(
        lunedi,
        fatto
          ? sb.from("allenamenti").delete().eq("giorno", giorno)
          : userId().then((user_id) => sb.from("allenamenti").insert({ user_id, giorno }))
      );
      if (error) setErrore(error.message);
    },
    [lunedi, setDati]
  );

  /** Solo per questa settimana. */
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
      const { error } = await scrivi(
        lunedi,
        userId().then((user_id) => createClient().from("sedute_spostate").upsert({ user_id, lunedi, giorni }))
      );
      if (error) setErrore(error.message);
    },
    [lunedi, setDati]
  );

  return { dati, errore, salvaPasto, segnaAllenamento, spostaSeduta };
}

/** Un sacchetto da congelare: quanto usano i pasti di quel giorno. */
export type Porzione = { g: number; giorno: string };

/** Per prodotto da porzionare, un sacchetto per giorno nei prossimi 7 giorni. */
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
      // Ogni pasto una volta: se oggi è passato, conta quello fra 7 giorni.
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

  // Non ottimistico: serve l'id della riga per poterla togliere.
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
        // Una riga con un pasto che quel giorno non prevede non gonfia il conto.
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

  /** null = torna da comprare. */
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
// Coppie chiave-valore, non Map: finiscono in localStorage come JSON.
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

export function useManca(spesa: Record<string, StatoSpesa> | null, oggi: string | null) {
  const [scorte, setScorte] = useState(scorteCache);
  useEffect(() => {
    // Errore ignorato qui: lo mostra la pagina Spesa.
    leggiScorte().then(setScorte, () => {});
  }, []);
  return useMemo(() => mancaDa(spesa, scorte, oggi ?? ""), [spesa, scorte, oggi]);
}

/** Stima: l'ultima quantità nota meno quello che i pasti hanno usato da allora. */
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
        // Servono solo dal giorno della scorta più vecchia.
        const primo = Object.values(lette).map((s) => adessoNelFuso(new Date(s.dal)).data).sort()[0];
        if (!primo) return setScelte(new Map());
        const sb = createClient();
        const [p, f] = await Promise.all([
          sb.from("pasti").select("giorno,pasto,ricetta,fatto,saltati,sostituti").gte("giorno", primo),
          sb.from("fuori_pasto").select("id,giorno,cibo,quando").gte("giorno", primo),
        ]);
        if (p.error) return setErrore(p.error.message);
        scelteCache = p.data.map((r) => [
          chiavePasto(r.giorno, r.pasto),
          { ricetta: r.ricetta, fatto: r.fatto, saltati: r.saltati, sostituti: r.sostituti },
        ]);
        // Senza tabella le scorte scendono solo coi pasti: l'errore lo mostra Oggi.
        fuoriCache = f.data ?? [];
        ricorda("scelte", scelteCache);
        ricorda("fuori", fuoriCache);
        setScelte(new Map(scelteCache));
        setFuori(fuoriCache);
      })
      .catch((e: Error) => setErrore(e.message));
  }, []);

  // giorni = da quanti giorni vale la quantità, per i freschi.
  const { stima, giorni } = useMemo(() => {
    const stima: Record<string, number> = {};
    const giorni: Record<string, number> = {};
    if (!scorte || !adesso) return { stima, giorni };
    const consumi = new Map<string, Record<string, number>>();
    for (const [id, s] of Object.entries(scorte)) {
      let c = consumi.get(s.dal);
      if (!c) {
        c = consumoFra(
          adessoNelFuso(new Date(s.dal)),
          adesso,
          (d, p) => scelte?.get(chiavePasto(d, p))?.ricetta,
          manca,
          (d, p) => scelte?.get(chiavePasto(d, p))?.saltati,
          (d, p) => !!scelte?.get(chiavePasto(d, p))?.fatto,
          (d, p) => scelte?.get(chiavePasto(d, p))?.sostituti
        );
        for (const [id, q] of Object.entries(consumoFuoriPasto(fuori, s.dal))) c[id] = (c[id] ?? 0) + q;
        consumi.set(s.dal, c);
      }
      stima[id] = Math.max(0, s.quantita - (c[id] ?? 0));
      giorni[id] = giorniDa(s.dal, adesso.data);
    }
    return { stima, giorni };
  }, [scorte, scelte, fuori, adesso, manca]);

  /** La stima riparte da queste quantità. */
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

  // null finché le scorte non sono lette, o se sei coperto.
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

  // Quanto serve dei freschi; null finché non si sa.
  const fabbisogno = useMemo(
    () => (adesso && scelte ? fabbisognoSettimana(adesso, (d, p) => scelte.get(chiavePasto(d, p))?.ricetta) : null),
    [adesso, scelte]
  );

  return { stima, giorni, manca, prossima, fabbisogno, pronto: !!scorte, errore, imposta };
}

/** Articoli del documento di consegna già abbinati a mano. */
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
