import { NextResponse } from "next/server";
import { pianoDi } from "@/lib/piani";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const sb = await createClient();
  // Senza sessione la RLS non dà righe e uscirebbe il piano predefinito.
  const { data: sessione } = await sb.auth.getClaims();
  if (!sessione?.claims) return NextResponse.json({ error: "non autorizzato" }, { status: 401 });

  const { data, error } = await sb.from("profili").select("piano,preferenze").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { versione, dati } = pianoDi(data?.piano);
  const nuovo = new URL(request.url).searchParams.get("v") !== versione;
  return NextResponse.json(
    { piano: data?.piano ?? "", preferenze: data?.preferenze ?? {}, versione, ...(nuovo && { dati }) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
