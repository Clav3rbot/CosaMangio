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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="spunta h-5 w-5">
        <path pathLength={1} d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}
