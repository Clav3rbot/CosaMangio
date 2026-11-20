// Piani di altri utenti, oltre a src/data/piano.json, per nome. La variabile d'ambiente PIANI ("id:nome") dice quale
// usa ogni utente; chi non c'è usa piano.json. I JSON li genera scripts/build_dieta.py dai file in piano/.
const altriPiani: Record<string, unknown> = {};
export default altriPiani;
