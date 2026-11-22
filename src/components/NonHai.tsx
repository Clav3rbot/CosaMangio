import { PackageX, Replace } from "lucide-react";
import { mancantiDi, sostituzioniDi, type Ricetta } from "@/lib/piano";

export default function NonHai({ r, manca }: { r: Ricetta; manca: (id: string) => boolean }) {
  const nomi = mancantiDi(r, manca);
  return (
    <>
      {nomi.length > 0 && (
        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-fat">
          <PackageX className="h-3.5 w-3.5 shrink-0" /> Non hai: {nomi.join(", ")}
        </span>
      )}
      {sostituzioniDi(r, manca).map(([nome, usa]) => (
        <span key={nome} className="mt-0.5 flex items-center gap-1 text-xs font-medium text-carb">
          <Replace className="h-3.5 w-3.5 shrink-0" /> Niente {nome.toLowerCase()}: usa {usa}
        </span>
      ))}
    </>
  );
}
