// Solo server: importato dal browser, i piani tornano scaricabili senza login.
import { createHash } from "node:crypto";
import altriPiani from "@/data/altri-piani";
// piano.json lo genera scripts/build_dieta.py da piano/mio.py: non modificarlo a mano.
import dati from "@/data/piano.json";
import { usaPiano, type DatiPiano, type PianoSalvato, type Preferenze } from "@/lib/piano";

export function pianoDi(nome: unknown = ""): PianoSalvato {
  const scelto = (typeof nome === "string" && Object.hasOwn(altriPiani, nome) ? altriPiani[nome] : dati) as DatiPiano;
  return { versione: createHash("sha256").update(JSON.stringify(scelto)).digest("hex").slice(0, 16), dati: scelto };
}

export const usaPianoDi = (nome?: unknown, preferenze?: Preferenze) => usaPiano(pianoDi(nome).dati, preferenze);
