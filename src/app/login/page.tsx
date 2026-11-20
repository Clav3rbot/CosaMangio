"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function traduciErrore(message: string) {
  if (message.includes("Invalid login credentials")) return "Email o password errate.";
  if (message.includes("Email not confirmed"))
    return "Email non confermata: in Supabase apri Authentication → Users e conferma l'utente.";
  if (message.includes("Invalid API key")) return "Chiave Supabase non valida: controlla .env.local e riavvia il server.";
  return `Errore di accesso: ${message}`;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setAttesa(true);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setErrore(traduciErrore(error.message));
      setAttesa(false);
      return;
    }
    // Pagina ricaricata, non navigazione interna: il proxy scrive il piano dell'utente nel cookie e i moduli ripartono
    // con quello (usaPiano in src/lib/piano.ts).
    location.replace("/");
  }

  return (
    <main className="pt-safe flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- icona statica, next/image non serve */}
          <img src="/icon-192.png" alt="" width={64} height={64} className="mx-auto mb-4 h-16 w-16 rounded-2xl" />
          <h1 className="text-3xl font-bold tracking-tight">CosaMangio</h1>
          <p className="mt-1 text-sm text-muted">Il tuo piano di ogni giorno</p>
        </div>
        <form onSubmit={accedi} className="card space-y-4 p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              // "username": è il valore che i gestori di password abbinano alla password salvata
              autoComplete="username"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
          </div>
          {errore && (
            <p role="alert" className="rounded-2xl bg-fat-soft px-3 py-2 text-sm text-fat">
              {errore}
            </p>
          )}
          <button type="submit" disabled={attesa} className="btn-primary w-full">
            {attesa ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      </div>
    </main>
  );
}
