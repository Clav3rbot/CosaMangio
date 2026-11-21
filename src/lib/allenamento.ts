import { aggiungiGiorni, indiceGiorno, piano, type Allenamento, type Esercizio } from "@/lib/piano";

/** I giorni (YYYY-MM-DD) delle sedute della settimana che parte da "lunedi": quelli spostati, se no i soliti. */
export const giorniSedute = (lunedi: string, spostate?: string[] | null) =>
  piano.allenamento ? (spostate ?? piano.allenamento.giorni.map((i) => aggiungiGiorni(lunedi, i))) : [];

const elenco = new Intl.ListFormat("it-IT");
/** "martedì e giovedì" */
export const nomiGiorni = (giorni: string[]) =>
  elenco.format(giorni.map((d) => piano.settimana[indiceGiorno(d)].giorno.toLowerCase()));

/** "Piegamenti, squat e plank": gli esercizi del circuito. */
export const nomiEsercizi = (a: Allenamento) =>
  elenco.format(a.circuito.map((e, i) => (i ? e.nome.toLowerCase() : e.nome)));

/** I passi della seduta guidata: riscaldamento, poi i giri del circuito con le pause. */
export function passiSeduta(a: Allenamento) {
  const passi: Esercizio[] = a.riscaldamento ? [a.riscaldamento] : [];
  for (let giro = 1; giro <= a.giri; giro++) {
    a.circuito.forEach((e, i) => {
      passi.push({ ...e, nome: `${e.nome} · giro ${giro} di ${a.giri}` });
      const ultimo = giro === a.giri && i === a.circuito.length - 1;
      if (!ultimo) passi.push({ nome: "Pausa", dettaglio: `Poi: ${a.circuito[(i + 1) % a.circuito.length].nome}.`, secondi: a.pausa });
    });
  }
  return passi;
}
