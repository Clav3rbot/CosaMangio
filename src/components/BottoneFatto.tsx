import { Check } from "lucide-react";

export default function BottoneFatto({
  fatto,
  nome,
  onClick,
  azione = "mangiato",
}: {
  fatto: boolean;
  nome: string;
  onClick: () => void;
  azione?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={fatto}
      aria-label={fatto ? `${nome}: segnato come ${azione}, tocca per annullare` : `Segna ${nome} come ${azione}`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 transition active:scale-90 ${
        fatto ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent"
      }`}
    >
      <Check className="h-5 w-5" strokeWidth={3} />
    </button>
  );
}
