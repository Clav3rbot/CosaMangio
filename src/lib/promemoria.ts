import { nomiEsercizi } from "@/lib/allenamento";
import {
  aggiungiGiorni,
  daScongelare,
  inPausa,
  indiceGiorno,
  mancantiDi,
  minutiDa,
  pastiDelGiorno,
  piano,
  ricettaProposta,
  ricettaValida,
  type PastoId,
} from "@/lib/piano";

export type Promemoria = { chiave: string; minuti: number; titolo: string; testo: string; url: string };

/** Ricetta scelta per quel pasto, o null se vale la proposta della rotazione. */
export type Scelta = (data: string, pasto: PastoId) => string | null | undefined;

export function ricettaDi(
  data: string,
  pasto: { id: PastoId; opzioni: string[] },
  scelta: Scelta,
  manca?: (id: string) => boolean
) {
  const id = scelta(data, pasto.id);
  // Vale anche una ricetta dello stesso pasto di un altro giorno (scambio); una che non esiste più torna alla rotazione.
  // La scelta vince anche se manca qualcosa: lì il pasto lo segnala, non la cambia da solo.
  return id && ricettaValida(pasto.id, id) ? id : ricettaProposta(data, pasto.opzioni, manca);
}

/** Le notifiche di un giorno, in ordine di orario. "allenamento" = quel giorno c'è una seduta prevista e non ancora
 *  fatta; "manca" dice quali prodotti non sono arrivati con la spesa. Quelli che l'utente ha spento non ci sono. */
export function promemoriaDelGiorno(
  data: string,
  scelta: Scelta,
  allenamento: boolean,
  manca: (id: string) => boolean = () => false
): Promemoria[] {
  // Prima dell'inizio niente avvisi; la sera prima del primo giorno solo quello dello scongelamento. Lo stesso in
  // pausa: niente, e l'ultima sera quello che serve per il giorno in cui riprendi.
  if (data < aggiungiGiorni(piano.inizio, -1)) return [];
  const iniziato = data >= piano.inizio && !inPausa(data);
  const out: Promemoria[] = [];
  for (const p of iniziato ? pastiDelGiorno(data) : []) {
    const r = piano.ricette[ricettaDi(data, p, scelta, manca)];
    const ora = minutiDa(p.ora);
    const nonHai = mancantiDi(r, manca);
    // Se il piatto chiede almeno 10 minuti, l'avviso arriva quando devi iniziare a cucinarlo. Non per il primo pasto
    // del piano, quello del risveglio: prima dell'orario dormi, l'avviso arriva all'ora del pasto.
    const cucina = p.id !== piano.pasti[0].id && !r.fuori && r.minuti >= 10;
    out.push({
      chiave: p.id,
      minuti: cucina ? Math.floor((ora - r.minuti) / 5) * 5 : ora,
      titolo: cucina ? `Inizia a cucinare: ${p.nome.toLowerCase()} alle ${p.ora}` : `${p.nome} · ${p.ora}`,
      testo:
        (r.minuti && !r.fuori ? `${r.nome} · ${r.minuti} min` : r.nome) +
        (nonHai.length ? ` · Non hai: ${nonHai.join(", ")}` : ""),
      url: `/pasto?d=${data}&p=${p.id}`,
    });
  }

  const domani = aggiungiGiorni(data, 1);
  const pastiDomani = inPausa(domani) ? [] : pastiDelGiorno(domani);
  const perDomani = [
    ...new Set(pastiDomani.flatMap((p) => daScongelare(piano.ricette[ricettaDi(domani, p, scelta, manca)], manca))),
  ];
  if (perDomani.length) {
    out.push({
      chiave: "scongela",
      minuti: minutiDa(piano.avvisi.scongela),
      titolo: "Per domani",
      testo: `Sposta dal freezer al frigo: ${perDomani.join(", ")}.`,
      url: `/?d=${domani}`,
    });
  }

  // La spesa si ordina il giorno prima della consegna.
  if (piano.consegna && indiceGiorno(domani) === piano.consegna.giorno && !inPausa(domani)) {
    out.push({
      chiave: "spesa",
      minuti: minutiDa(piano.avvisi.ordina),
      titolo: "Ordina la spesa",
      testo: `La consegna è domani alle ${piano.consegna.ora}: in Spesa trovi cosa comprare.`,
      url: "/spesa",
    });
  }

  if (iniziato && allenamento && piano.allenamento) {
    out.push({
      chiave: "allenamento",
      minuti: minutiDa(piano.allenamento.ora),
      titolo: `Allenamento · ${piano.allenamento.descrizione}`,
      testo: `${nomiEsercizi(piano.allenamento)}.`,
      url: "/allenamento",
    });
  }
  return out.filter((p) => !piano.avvisi.muti.includes(p.chiave)).sort((a, b) => a.minuti - b.minuti);
}
