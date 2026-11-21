// Piani di altri utenti, oltre a src/data/piano.json, per nome. La colonna "piano" della tabella profili dice quale
// usa ogni utente; chi non ha una riga usa piano.json. I JSON li genera scripts/build_dieta.py dai file in piano/.
const altriPiani: Record<string, unknown> = {};
export default altriPiani;
