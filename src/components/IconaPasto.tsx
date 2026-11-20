import { Apple, Coffee, Moon, Soup, UtensilsCrossed } from "lucide-react";
import type { PastoId } from "@/lib/piano";

const ICONE = { colazione: Coffee, pranzo: UtensilsCrossed, merenda: Apple, cena: Soup, dopocena: Moon };

export default function IconaPasto({ id, className }: { id: PastoId; className?: string }) {
  const Icona = ICONE[id];
  return <Icona className={className} aria-hidden />;
}
