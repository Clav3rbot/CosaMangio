/** suona: appena riaccesa. */
export default function Campanella({ accesa, suona = false }: { accesa: boolean; suona?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`campanella h-5 w-5 overflow-visible ${accesa ? (suona ? "suona" : "") : "spenta"}`}
    >
      <g className="campanella-corpo">
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        <path className="campanella-batacchio" d="M10.268 21a2 2 0 0 0 3.464 0" />
      </g>
      <path className="campanella-barra campanella-stacco" pathLength={1} d="m2 2 20 20" />
      <path className="campanella-barra" pathLength={1} d="m2 2 20 20" />
    </svg>
  );
}
