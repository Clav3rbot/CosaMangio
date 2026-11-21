// Controlli della logica dell'app (documento di consegna, scorte, avvisi, rotazione): `npm test`. Girano sempre sul
// piano d'esempio (piano/esempio.json), qualunque sia src/data/piano.json: passano uguali con ogni piano. La coerenza
// di un piano (fasce, spesa) la controlla il motore, scripts/build_dieta.py. Le righe del documento di consegna sono
// inventate sul formato vero.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const percorso = (p) => fileURLToPath(new URL(p, import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "@/data/piano.json": percorso("../piano/esempio.json"), "@": percorso("../src") },
});
const { piano, pastiDelGiorno, senzaSaltati, sorelleDi, timerNelPasso } = await jiti.import("../src/lib/piano.ts");
const { interpretaLinee, prodottoRiga, quantitaRiga } = await jiti.import("../src/lib/scontrino.ts");
const { consumoFra, consumoFuoriPasto, confezioniDaComprare, contaPerSpesa, mancaDa, primaMancanza, quantoMostrare, GIORNI_FRESCO } =
  await jiti.import("../src/lib/scorte.ts");
const { promemoriaDelGiorno, ricettaDi } = await jiti.import("../src/lib/promemoria.ts");
const { giorniSedute, nomiGiorni } = await jiti.import("../src/lib/allenamento.ts");

// Il piano d'esempio parte lunedì 5 gennaio 2026.
assert.equal(piano.inizio, "2026-01-05");
const voce = Object.fromEntries(piano.spesa.map((v) => [v.id, v]));
const nessuna = () => null;

// --- Documento di consegna ---
const doc = interpretaLinee([
  "Documento di consegna del 04/01/2026",
  "ARTICOLI",
  "708017 - POLLO/PETTO FETTE 10+ 0.678 Kg €9.89 €6.71",
  "111111 - CECI LESSATI 400GX3 1 €2.99 €2.99",
  "222222 - MOZZARELLA 4X100 1 €2.49 €2.49",
  "763909 - PATATE GIALLE 1 €1.99 €1.99",
  "333333 - UOVA FRESCHE X6 2 €2.10 €4.20",
  "444444 - ZUCCHERO SACCHETTO 1 €1.09 €1.09",
  "555555 - PASTA INTEGRALE 2 €1.50 €3.00",
  "ARTICOLI IN OMAGGIO",
  "999999 - PELUCHE 1",
  "ARTICOLI NON CONSEGNATI",
  "666666 - MERLUZZO FILETTI 1",
]);
assert.equal(doc.data, "2026-01-04");
assert.equal(doc.righe.length, 8); // 7 consegnati e 1 no; l'omaggio è un gadget e si salta
const riga = Object.fromEntries(doc.righe.map((r) => [r.codice, r]));
assert.equal(riga[666666].consegnata, false);
assert.equal(riga[708017].qta, "0.678 Kg");

// Senza SCONTRINO nel piano le parole non riconoscono niente: vale solo quello che hai sistemato tu per un codice.
assert.equal(piano.scontrino.length, 0);
assert.equal(prodottoRiga(riga[708017], {}), undefined);
assert.equal(prodottoRiga(riga[708017], { 708017: { prodotto: "pollo", grammi: null } }), "pollo");
assert.equal(prodottoRiga(riga[444444], { 444444: { prodotto: "", grammi: null } }), null); // "" = non è nella lista

assert.deepEqual(quantitaRiga(riga[708017], voce.pollo), { q: 678, stimata: false }); // pesato
assert.deepEqual(quantitaRiga(riga[111111], voce.ceci), { q: 720, stimata: false }); // 3 lattine, sgocciolate
assert.deepEqual(quantitaRiga(riga[222222], voce.mozzarella), { q: 400, stimata: false }); // 4 da 100 g
assert.deepEqual(quantitaRiga(riga[333333], voce.uova), { q: 12, stimata: false }); // 2 confezioni da 6
assert.deepEqual(quantitaRiga(riga[763909], voce.patate, 1500), { q: 1500, stimata: false }); // peso noto
// Niente peso scritto: vale la confezione tipica, finché non lo scrivi tu.
assert.deepEqual(quantitaRiga(riga[555555], voce.pasta), { q: 2 * voce.pasta.conf, stimata: true });
assert.deepEqual(quantitaRiga(riga[555555], voce.pasta, 400), { q: 800, stimata: false });

// --- Scorte ---
// Da domenica sera (prima dell'inizio) a lunedì alle 15: colazione e pranzo, la merenda delle 16:30 non ancora.
assert.deepEqual(
  consumoFra({ data: "2026-01-04", minuti: 19 * 60 }, { data: "2026-01-05", minuti: 15 * 60 }, nessuna),
  { yogurt: 150, avena: 60, banane: 120, pasta: 110, pomodori: 200, grana: 15 }
);
// Una settimana intera: mai più di quanto serve a settimana, con la rotazione che cambia i piatti.
for (const lunedi of ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]) {
  const fine = new Date(Date.parse(lunedi) + 6 * 86_400_000).toISOString().slice(0, 10);
  const sett = consumoFra({ data: lunedi, minuti: -1 }, { data: fine, minuti: 1439 }, nessuna);
  // Il pane fa eccezione: è una_confezione, e la merenda "Pane e grana" di lunedì e venerdì ne usa 40 g in più.
  for (const v of piano.spesa) {
    const tetto = v.q + (v.id === "pane" ? 80 : 0);
    assert.ok((sett[v.id] ?? 0) <= tetto, `${lunedi} ${v.id}: ${sett[v.id]} > ${tetto}`);
  }
}
// Una scelta conta: lunedì sera la frittata invece del pollo.
const frittata = (d, p) => (d === "2026-01-05" && p === "cena" ? "frittata-con-pomodori-e-insalata" : null);
const cena = consumoFra({ data: "2026-01-05", minuti: 19 * 60 }, { data: "2026-01-05", minuti: 21 * 60 }, frittata);
assert.equal(cena.uova, 3);
assert.equal(cena.pollo, undefined);

assert.equal(confezioniDaComprare(voce.pomodori, 120), 3); // 1150 - 120 = 1030 g: 3 vaschette da 500
assert.equal(confezioniDaComprare(voce.pollo, 678), 0);
assert.equal(confezioniDaComprare(voce.ceci, 0), 4); // 960 g sgocciolati: 4 lattine
assert.equal(quantoMostrare(voce.pollo, 678), "680 g");
assert.equal(quantoMostrare(voce.banane, 755), "6");
assert.equal(quantoMostrare(voce.banane, 755, true), "755 g");

// Il fresco vale pochi giorni: l'insalata avanzata da una settimana non riduce la spesa dopo, la pasta sì.
assert.ok(voce.insalata.fresco && !voce.pasta.fresco && !voce.mele.fresco);
assert.equal(contaPerSpesa(voce.insalata, 230, GIORNI_FRESCO), 230);
assert.equal(contaPerSpesa(voce.insalata, 230, GIORNI_FRESCO + 1), 0);
assert.equal(contaPerSpesa(voce.pasta, 140, 30), 140);
assert.equal(confezioniDaComprare(voce.insalata, contaPerSpesa(voce.insalata, 230, 6)), 2); // avanzo non contato

// --- Ingredienti non mangiati ---
// Merenda con il solo yogurt: la mela esce da kcal, proteine e prodotti usati.
const merenda = piano.ricette["yogurt-e-mela"];
assert.deepEqual(senzaSaltati(merenda), { kcal: merenda.kcal, prot: merenda.prot, prodotti: merenda.prodotti });
assert.deepEqual(senzaSaltati(merenda, ["Mela"]), { kcal: 86, prot: 15, prodotti: { yogurt: 150, mele: 0 } });
// Le scorte: la mela non mangiata non scende.
const pomeriggio = [{ data: "2026-01-05", minuti: 16 * 60 }, { data: "2026-01-05", minuti: 17 * 60 }];
const conMela = consumoFra(...pomeriggio, () => "yogurt-e-mela");
const senzaMela = consumoFra(...pomeriggio, () => "yogurt-e-mela", undefined, () => ["Mela"]);
assert.equal(conMela.mele - senzaMela.mele, 150);

// --- Avvisi ---
const riassunto = (l) => l.map((p) => `${p.chiave}@${p.minuti}: ${p.titolo} | ${p.testo}`);
// Prima dell'inizio niente; la sera prima solo lo scongelamento, con la ricetta in uso.
assert.deepEqual(promemoriaDelGiorno("2026-01-03", nessuna, false), []);
assert.deepEqual(riassunto(promemoriaDelGiorno("2026-01-04", nessuna, false)), [
  "scongela@1350: Per domani | Sposta dal freezer al frigo: pollo, pane.",
]);
assert.deepEqual(riassunto(promemoriaDelGiorno("2026-01-04", frittata, false)), [
  "scongela@1350: Per domani | Sposta dal freezer al frigo: pane.",
]);
// Martedì: il primo pasto all'ora del pasto, gli altri quando iniziare a cucinare, poi la seduta e lo scongelamento.
assert.deepEqual(riassunto(promemoriaDelGiorno("2026-01-06", nessuna, true)), [
  "colazione@450: Colazione · 07:30 | Uova strapazzate e pane · 8 min",
  "pranzo@740: Inizia a cucinare: pranzo alle 13:00 | Pasta e lenticchie · 40 min",
  "merenda@990: Merenda · 16:30 | Yogurt e mela",
  "allenamento@1140: Allenamento · 20 minuti, a casa, con un tappetino | Squat, piegamenti sulle ginocchia, ponte per i glutei e plank.",
  "cena@1160: Inizia a cucinare: cena alle 20:00 | Merluzzo al forno con patate · 40 min",
  "scongela@1350: Per domani | Sposta dal freezer al frigo: pane.",
]);
assert.ok(!promemoriaDelGiorno("2026-01-06", nessuna, false).some((p) => p.chiave === "allenamento"));
// Sedute: martedì e venerdì, finché non le sposti.
assert.deepEqual(giorniSedute("2026-01-05"), ["2026-01-06", "2026-01-09"]);
assert.deepEqual(giorniSedute("2026-01-05", ["2026-01-07", "2026-01-09"]), ["2026-01-07", "2026-01-09"]);
assert.equal(nomiGiorni(["2026-01-07", "2026-01-09"]), "mercoledì e venerdì");
// Merluzzo non arrivato: martedì sera la proposta diventa il ripiego, e lunedì sera il pesce non si scongela.
const manca = (id) => id === "merluzzo";
const lunedi = promemoriaDelGiorno("2026-01-05", nessuna, false, manca);
assert.equal(lunedi.find((p) => p.chiave === "scongela").testo, "Sposta dal freezer al frigo: pane.");
assert.equal(
  promemoriaDelGiorno("2026-01-05", nessuna, false).find((p) => p.chiave === "scongela").testo,
  "Sposta dal freezer al frigo: pane, pesce."
);
const cenaMartedi = promemoriaDelGiorno("2026-01-06", nessuna, false, manca).find((p) => p.chiave === "cena");
assert.ok(cenaMartedi.testo.startsWith("Lenticchie in umido con pane · "), cenaMartedi.testo);
// Nessuna ricetta del pasto si può fare: resta quella della rotazione, e la notifica lo dice.
const pranzoMartedi = promemoriaDelGiorno("2026-01-06", nessuna, false, (id) => id === "lenticchie").find(
  (p) => p.chiave === "pranzo"
);
assert.ok(pranzoMartedi.testo.endsWith(" · Non hai: lenticchie secche"), pranzoMartedi.testo);
// La scelta fatta a mano vince anche se manca qualcosa: il pesce non si scongela, ma il piatto non cambia.
const soloPesce = (d, p) => (d === "2026-01-05" && p === "cena" ? "merluzzo-al-forno-con-patate" : null);
assert.deepEqual(riassunto(promemoriaDelGiorno("2026-01-04", soloPesce, false, manca)), []);
assert.equal(ricettaDi("2026-01-05", pastiDelGiorno("2026-01-05").find((p) => p.id === "cena"), soloPesce, manca),
  "merluzzo-al-forno-con-patate");

// --- Cosa non hai, dalle scorte ---
// Consegna di domenica sera: tutti i freschi tranne l'insalata, e il merluzzo non consegnato.
const dal = "2026-01-04T19:00:00Z";
const consegna = Object.fromEntries(
  piano.spesa.filter((v) => v.fresco && v.id !== "insalata").map((v) => [v.id, { quantita: 500, dal }])
);
const nonHo = mancaDa({ merluzzo: "manca" }, consegna, "2026-01-05");
assert.ok(nonHo("insalata")); // fresco che non è arrivato
assert.ok(!nonHo("pomodori"));
assert.ok(nonHo("merluzzo")); // ordinato e non arrivato
assert.ok(!nonHo("pasta") && !nonHo("uova")); // dispensa senza scorta: si suppone in casa
assert.ok(mancaDa({}, { ...consegna, pomodori: { quantita: 0, dal } }, "2026-01-05")("pomodori")); // segnati finiti
assert.ok(mancaDa({}, consegna, "2026-01-12")("pomodori")); // fresco arrivato 8 giorni fa: finito o da buttare
assert.ok(!mancaDa({}, {}, "2026-01-05")("insalata")); // nessuna scorta: non si sa niente

// --- Quando serve la spesa ---
// Due uova bastano per la colazione di martedì, non per la frittata di mercoledì sera.
const tanti = Object.fromEntries(Object.entries(consegna).map(([id, s]) => [id, { ...s, quantita: 5000 }]));
const sera = { data: "2026-01-04", minuti: 22 * 60 };
const quanti = (scorte) => Object.fromEntries(Object.entries(scorte).map(([id, s]) => [id, s.quantita]));
const pocheUova = { ...tanti, insalata: { quantita: 5000, dal }, uova: { quantita: 2, dal } };
assert.deepEqual(primaMancanza(sera, {}, pocheUova, quanti(pocheUova), nessuna), {
  data: "2026-01-07",
  pasto: "cena",
  prodotti: ["uova"],
});
// Con tutto in abbondanza la spesa serve quando i freschi hanno più di una settimana: lunedì 12 a colazione.
const tutto = { ...tanti, insalata: { quantita: 5000, dal }, uova: { quantita: 100, dal } };
const dopo = primaMancanza(sera, {}, tutto, quanti(tutto), nessuna);
assert.deepEqual([dopo.data, dopo.pasto], ["2026-01-12", "colazione"]);
assert.ok(dopo.prodotti.includes("yogurt") && !dopo.prodotti.includes("uova"));

// Le proposte cambiano solo dove manca qualcosa.
const proposta = (data, pasto) => ricettaDi(data, pastiDelGiorno(data).find((p) => p.id === pasto), nessuna, nonHo);
assert.equal(proposta("2026-01-05", "pranzo"), "pasta-al-pomodoro");
// Lunedì sera tutte le scelte usano l'insalata: resta il piatto della rotazione, con il suo "Non hai".
assert.equal(proposta("2026-01-05", "cena"), "pollo-alla-piastra-con-insalata");
assert.equal(proposta("2026-01-06", "cena"), "lenticchie-in-umido-con-pane");
// La settimana dopo la rotazione propone l'alternativa.
assert.equal(ricettaDi("2026-01-12", pastiDelGiorno("2026-01-12").find((p) => p.id === "pranzo"), nessuna),
  "pasta-pomodoro-e-ceci");
// Con tutto in casa i ripieghi e i piatti fuori casa scelti al posto di uno del piano non entrano mai nella rotazione.
for (let i = 0; i < 8 * 7; i++) {
  const d = new Date(Date.parse(piano.inizio) + i * 86_400_000).toISOString().slice(0, 10);
  for (const p of pastiDelGiorno(d)) assert.ok(!piano.ricette[ricettaDi(d, p, nessuna)].ripiego, `${d} ${p.id}`);
}
// I pasti sono facoltativi: nel fine settimana niente merenda.
assert.deepEqual(pastiDelGiorno("2026-01-10").map((p) => p.id), ["colazione", "pranzo", "cena"]);
// Un pasto arrivato da uno scambio porta con sé le sue alternative.
assert.ok(sorelleDi("merenda", "yogurt-e-mela").includes("pane-e-grana"));

// Scambio: la cena del lunedì vale anche il martedì; una ricetta di pranzo a cena no, torna la rotazione.
const cenaDi = pastiDelGiorno("2026-01-06").find((p) => p.id === "cena");
assert.equal(ricettaDi("2026-01-06", cenaDi, () => "pollo-alla-piastra-con-insalata"), "pollo-alla-piastra-con-insalata");
assert.equal(ricettaDi("2026-01-06", cenaDi, () => "pasta-e-lenticchie"), "merluzzo-al-forno-con-patate");

// --- Timer delle ricette: un nome che dice cosa cuoce, non "Passo 3" ---
const nomi = (passo, ricetta = "") => timerNelPasso(passo, ricetta).map((t) => `${t.nome} ${t.secondi / 60}`);
assert.deepEqual(nomi("Intanto pomodorini in padella con 5 g di olio per 8 minuti, e spaghetti per 10 minuti."), [
  "Pomodorini in padella 8",
  "Spaghetti 10",
]);
assert.deepEqual(nomi("Cuoci le penne per 11 minuti; dopo 3 minuti aggiungi i broccoli nella stessa pentola."), ["Penne 11", "Broccoli 3"]);
assert.deepEqual(nomi("Cuoci il pollo per 4 minuti per lato."), ["Pollo, per lato 4"]);
// Nessun cibo nel passaggio: vale il nome della ricetta.
assert.deepEqual(nomi("Cuoci per 40 minuti, girando tutto a metà cottura.", "Fusi di pollo al forno con patate"), ["Pollo 40"]);

// --- Cibi fuori dai pasti: scalano le scorte solo se segnati dopo la consegna e mangiati da quel giorno in poi ---
const segnataDal = "2026-01-06T10:00:00.000Z"; // 11:00 in Italia
const fuoriPasto = [
  { id: 1, giorno: "2026-01-06", cibo: "banana", quando: "2026-01-06T09:00:00.000Z" }, // prima della consegna
  { id: 2, giorno: "2026-01-05", cibo: "banana", quando: "2026-01-06T12:00:00.000Z" }, // di ieri, segnata dopo
  { id: 3, giorno: "2026-01-06", cibo: "mela", quando: "2026-01-06T20:00:00.000Z" },
  { id: 4, giorno: "2026-01-06", cibo: "mandarino", quando: "2026-01-06T20:00:00.000Z" }, // fuori dalla lista
  { id: 5, giorno: "2026-01-06", cibo: "banana", quando: "2026-01-06T21:00:00.000Z" },
];
assert.deepEqual(consumoFuoriPasto(fuoriPasto, segnataDal), { mele: 150, banane: 120 });

// --- Piano per utente: il profilo dice il nome, usaPiano lo carica e il codice del cron lo segue ---
// Con "@/lib/..." come nell'app: jiti carica due volte lo stesso file se lo si chiede con due percorsi diversi.
const modPiano = await jiti.import("@/lib/piano");
const modAllenamento = await jiti.import("@/lib/allenamento");
const { promemoriaDelGiorno: promemoriaCron } = await jiti.import("@/lib/promemoria");
const { default: altriPiani } = await jiti.import("../src/data/altri-piani.ts");
for (const [nome, p] of Object.entries(altriPiani)) {
  modPiano.usaPiano(nome);
  assert.equal(modPiano.piano.inizio, p.inizio);
  assert.deepEqual(modPiano.piano.allenamento, p.allenamento);
  assert.deepEqual(modPiano.pastiDelGiorno(p.inizio).map((s) => s.id), Object.keys(p.settimana[0].pasti));
  // Quello che usa il cron: le sedute della settimana e gli avvisi del giorno.
  assert.equal(modAllenamento.giorniSedute(p.inizio).length, p.allenamento?.giorni.length ?? 0);
  const avvisi = promemoriaCron(p.inizio, nessuna, true).map((x) => x.chiave);
  assert.equal(avvisi.some((k) => k.includes("allen")), !!p.allenamento);
}
modPiano.usaPiano("non esiste");
assert.equal(modPiano.piano.inizio, "2026-01-05");
assert.equal(modAllenamento.giorniSedute("2026-01-05").length, 2);

// Nome e preferenze li scrive l'utente nella sua riga: niente di quello che può metterci fa saltare il piano.
for (const [nome, pref] of [["constructor", {}], ["__proto__", {}], ["", null], ["", "x"], ["", []], ["", { orari: 3, consegna: "x", pause: [null, 5], muti: [null] }]]) {
  modPiano.usaPiano(nome, pref);
  assert.equal(modPiano.piano.inizio, "2026-01-05", `${nome} ${JSON.stringify(pref)}`);
  assert.equal(promemoriaCron("2026-01-06", nessuna, true).length, 6);
}

// --- Preferenze: orari dell'utente sopra quelli del piano, avvisi spenti ---
const avvisiCon = (pref) => {
  modPiano.usaPiano("", pref);
  return riassuntoCron(promemoriaCron("2026-01-06", nessuna, true));
};
const riassuntoCron = (l) => l.map((p) => `${p.chiave}@${p.minuti}`);
const soliti = avvisiCon({});
assert.deepEqual(soliti, ["colazione@450", "pranzo@740", "merenda@990", "allenamento@1140", "cena@1160", "scongela@1350"]);
// Pranzo alle 14 (40 minuti di cucina: avviso alle 13:20), seduta alle 18, freezer alle 21:15, colazione spenta.
assert.deepEqual(
  avvisiCon({ orari: { pranzo: "14:00" }, allenamento: "18:00", scongela: "21:15", muti: ["colazione"] }),
  ["pranzo@800", "merenda@990", "allenamento@1080", "cena@1160", "scongela@1275"]
);
assert.equal(modPiano.piano.pasti.find((p) => p.id === "pranzo").ora, "14:00");
// Il consumo delle scorte segue l'ora nuova: alle 13:30 il pranzo delle 14 non è ancora mangiato.
const { consumoFra: consumoCron } = await jiti.import("@/lib/scorte");
assert.deepEqual(consumoCron({ data: "2026-01-05", minuti: 12 * 60 }, { data: "2026-01-05", minuti: 13 * 60 + 30 }, nessuna), {});
// Dal database può arrivare di tutto: ore non valide e pasti fuori ordine si ignorano, il piano resta com'è.
assert.deepEqual(avvisiCon({ orari: { pranzo: "25:00" }, scongela: 7, muti: "no" }), soliti);
assert.deepEqual(avvisiCon({ orari: { pranzo: "21:00" } }), soliti);
// Tolte le preferenze tornano gli orari del piano, e il JSON del piano non è stato toccato.
assert.deepEqual(avvisiCon({}), soliti);

// --- Consegna della spesa: il giorno prima l'avviso di ordinarla ---
// Consegna il mercoledì (2) alle 19: martedì 6 l'avviso alle 12:00, o all'ora scelta; mercoledì niente.
assert.ok(avvisiCon({ consegna: { giorno: 2, ora: "19:00" } }).includes("spesa@720"));
assert.ok(avvisiCon({ consegna: { giorno: 2, ora: "19:00" }, ordina: "10:30" }).includes("spesa@630"));
assert.ok(!avvisiCon({ consegna: { giorno: 1, ora: "19:00" } }).some((a) => a.startsWith("spesa")));
assert.deepEqual(avvisiCon({ consegna: { giorno: 9, ora: "19:00" } }), soliti); // giorno che non esiste
modPiano.usaPiano("", { consegna: { giorno: 2, ora: "19:00" } });
assert.deepEqual(modPiano.prossimaConsegna({ data: "2026-01-06", minuti: 600 }), { data: "2026-01-07", minuti: 1140 });
assert.deepEqual(modPiano.prossimaConsegna({ data: "2026-01-07", minuti: 600 }), { data: "2026-01-07", minuti: 1140 });
assert.deepEqual(modPiano.prossimaConsegna({ data: "2026-01-07", minuti: 1140 }), { data: "2026-01-14", minuti: 1140 });
modPiano.usaPiano();
assert.equal(modPiano.prossimaConsegna({ data: "2026-01-06", minuti: 600 }), null);

// --- Freschi: si compra quello che usano i piatti della settimana, non la quantità fissa della lista ---
const { fabbisognoSettimana, quantoServe } = await jiti.import("@/lib/scorte");
// Domenica 11 sera, per la settimana del 12: la rotazione usa 750 g di yogurt, la lista fissa ne conta 1050.
const sett12 = fabbisognoSettimana({ data: "2026-01-11", minuti: 22 * 60 }, nessuna);
assert.equal(voce.yogurt.q, 1050);
assert.equal(quantoServe(voce.yogurt, sett12), 750);
assert.equal(confezioniDaComprare(voce.yogurt, 0, quantoServe(voce.yogurt, sett12)), 2); // non 3
// Quello che si conserva resta alla quantità fissa, e senza fabbisogno noto anche i freschi.
assert.equal(quantoServe(voce.pasta, sett12), voce.pasta.q);
assert.equal(quantoServe(voce.yogurt, null), 1050);
// Prima dell'inizio la settimana è la prima del piano, intera; con la consegna è quella che parte da lì.
assert.deepEqual(
  fabbisognoSettimana({ data: "2026-01-02", minuti: 600 }, nessuna),
  consumoCron({ data: "2026-01-05", minuti: -1 }, { data: "2026-01-11", minuti: 1439 }, nessuna)
);
modPiano.usaPiano("", { consegna: { giorno: 6, ora: "20:00" } }); // domenica sera
const daMercoledi = fabbisognoSettimana({ data: "2026-01-07", minuti: 600 }, nessuna); // consegna domenica 11
assert.equal(daMercoledi.yogurt, 750 + 0); // la settimana del 12, dopo la cena di domenica
// Lunedì 12, a consegna appena passata: vale la settimana che parte adesso, non quella dopo la prossima consegna.
assert.equal(fabbisognoSettimana({ data: "2026-01-12", minuti: 0 }, nessuna).yogurt, 750);
modPiano.usaPiano();

// --- Pasti saltati: in un giorno passato con almeno una spunta, i pasti non segnati non scalano le scorte ---
const lunSera = [{ data: "2026-01-04", minuti: 19 * 60 }, { data: "2026-01-06", minuti: 0 }];
const tuttoLunedi = consumoCron(...lunSera, nessuna);
const soloPranzo = (d, p) => d === "2026-01-05" && p === "pranzo";
assert.deepEqual(consumoCron(...lunSera, nessuna, undefined, undefined, soloPranzo), { pasta: 110, pomodori: 200, grana: 15 });
// Nessuna spunta in tutto il giorno: non si sa niente, conta tutto come prima.
assert.deepEqual(consumoCron(...lunSera, nessuna, undefined, undefined, () => false), tuttoLunedi);
// Oggi no: la spunta può ancora arrivare, vale l'orario.
assert.deepEqual(
  consumoCron({ data: "2026-01-04", minuti: 19 * 60 }, { data: "2026-01-05", minuti: 15 * 60 }, nessuna, undefined, undefined, soloPranzo),
  { yogurt: 150, avena: 60, banane: 120, pasta: 110, pomodori: 200, grana: 15 }
);

// --- Pausa: niente avvisi, le scorte scendono solo per il segnato, la sera prima di riprendere si scongela ---
const inPausa = { pause: [{ dal: "2026-01-06", al: "2026-01-07" }, { dal: "nonunadata" }] };
assert.deepEqual(avvisiCon(inPausa), []); // martedì 6, in pausa anche domani
modPiano.usaPiano("", inPausa);
assert.equal(modPiano.piano.pause.length, 1); // quella senza data valida è ignorata
assert.ok(!modPiano.inPausa("2026-01-05") && modPiano.inPausa("2026-01-07") && !modPiano.inPausa("2026-01-08"));
// Lunedì 5 non si scongela niente per martedì; mercoledì 7 sera sì, per giovedì.
assert.ok(!riassuntoCron(promemoriaCron("2026-01-05", nessuna, false)).some((a) => a.startsWith("scongela")));
assert.deepEqual(riassuntoCron(promemoriaCron("2026-01-07", nessuna, true)), ["scongela@1350"]);
// Da lunedì sera a giovedì mattina presto: due giorni di pausa non consumano niente, tranne un pranzo segnato.
const pausaInMezzo = [{ data: "2026-01-05", minuti: 23 * 60 }, { data: "2026-01-08", minuti: 0 }];
assert.deepEqual(consumoCron(...pausaInMezzo, nessuna), {});
assert.deepEqual(Object.keys(consumoCron(...pausaInMezzo, nessuna, undefined, undefined, (d, p) => d === "2026-01-06" && p === "pranzo")).length > 0, true);
// Una pausa aperta non finisce, e la prossima spesa non la conta fra i giorni in cui manca qualcosa.
modPiano.usaPiano("", { pause: [{ dal: "2026-01-05" }] });
assert.ok(modPiano.inPausa("2027-01-01"));
const { primaMancanza: mancanzaCron } = await jiti.import("@/lib/scorte");
assert.equal(mancanzaCron(sera, {}, pocheUova, quanti(pocheUova), nessuna), null);
modPiano.usaPiano();

console.log("OK");
