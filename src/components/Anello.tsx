/** Anello di avanzamento (0-1), con il contenuto al centro. */
export default function Anello({
  valore,
  size = 180,
  spessore = 14,
  colore = "var(--accent)",
  children,
}: {
  valore: number;
  size?: number;
  spessore?: number;
  colore?: string;
  children?: React.ReactNode;
}) {
  const r = (size - spessore) / 2;
  const giro = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, valore));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={spessore} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colore}
          strokeWidth={spessore}
          strokeLinecap="round"
          strokeDasharray={giro}
          strokeDashoffset={giro * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
