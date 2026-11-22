import { PackageX } from "lucide-react";
import { mancantiDi, type Ricetta } from "@/lib/piano";

export default function NonHai({ r, manca }: { r: Ricetta; manca: (id: string) => boolean }) {
  const nomi = mancantiDi(r, manca);
  if (!nomi.length) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-fat">
      <PackageX className="h-3.5 w-3.5 shrink-0" /> Non hai: {nomi.join(", ")}
    </span>
  );
}
