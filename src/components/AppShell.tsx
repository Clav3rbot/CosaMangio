"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CalendarDays, ChefHat, Dumbbell, House, ShoppingCart, UserRound } from "lucide-react";
import { guidaDaRiaprire } from "@/components/Guida";
import { ALLENAMENTO } from "@/lib/allenamento";
import { INIZIO, adessoNelFuso, aggiungiGiorni, minutiDa, pastiDelGiorno } from "@/lib/piano";

const VOCI = [
  { href: "/", label: "Oggi", Icon: House },
  { href: "/settimana", label: "Settimana", Icon: CalendarDays },
  null, // posto del tasto centrale
  { href: "/spesa", label: "Spesa", Icon: ShoppingCart },
  // Senza allenamento nel piano il quinto posto va a Tu, che se no si apre da Oggi.
  ALLENAMENTO
    ? { href: "/allenamento", label: "Allena", Icon: Dumbbell }
    : { href: "/tu", label: "Tu", Icon: UserRound },
];

const primo = (data: string) => ({ data, id: pastiDelGiorno(data)[0].id });

/** Il pasto da cucinare adesso: il primo di oggi non ancora passato da più di un'ora, se no il primo di domani. */
function pastoDaCucinare() {
  const { data, minuti } = adessoNelFuso();
  if (data < INIZIO) return primo(INIZIO);
  const p = pastiDelGiorno(data).find((s) => minutiDa(s.ora) + 60 > minuti);
  return p ? { data, id: p.id } : primo(aggiungiGiorni(data, 1));
}

const nessunaIscrizione = () => () => {};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // L'HTML statico è costruito col piano predefinito, il browser usa quello dell'utente (usaPiano): le pagine si
  // disegnano solo nel browser, così nessuno vede per un attimo il piano di un altro.
  const nelBrowser = useSyncExternalStore(nessunaIscrizione, () => true, () => false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // iOS chiude l'app in background (telefono bloccato) e la riapre dalla Home: si torna alla guida lasciata aperta.
  useEffect(() => {
    const g = guidaDaRiaprire();
    if (g && g !== location.pathname + location.search) router.replace(g);
  }, [router]);

  if (!nelBrowser) return null;

  return (
    <>
      <main className="pt-safe pb-nav mx-auto w-full max-w-md flex-1 px-4">{children}</main>
      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {VOCI.map((v) => {
            if (!v) {
              return (
                <div key="cucina" className="flex justify-center">
                  <button
                    type="button"
                    aria-label="Cucina il prossimo pasto"
                    onClick={() => {
                      const p = pastoDaCucinare();
                      router.push(`/pasto?d=${p.data}&p=${p.id}&cucina=1`);
                    }}
                    className="-mt-5 mb-2 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg transition active:scale-95"
                  >
                    <ChefHat className="h-6 w-6" />
                  </button>
                </div>
              );
            }
            const attiva = v.href === "/" ? pathname === "/" : pathname.startsWith(v.href);
            return (
              <Link
                key={v.href}
                href={v.href}
                aria-current={attiva ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  attiva ? "text-accent" : "text-muted"
                }`}
              >
                <v.Icon className="h-6 w-6" strokeWidth={attiva ? 2.4 : 1.8} />
                {v.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
