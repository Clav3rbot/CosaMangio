"use client";

export default function Errore() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-muted">Qualcosa non ha funzionato.</p>
      <button type="button" className="btn-primary" onClick={() => location.reload()}>
        Ricarica
      </button>
    </div>
  );
}
