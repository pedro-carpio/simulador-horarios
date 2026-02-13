// ===========================================================
// Edge Function: scrape_carreras
// Scrapea las carreras de https://www.hum.umss.edu.bo/horarios/
// y las upserta en la DB mediante la RPC upsert_carreras.
//
// Seguridad: requiere header X-Scrape-Secret que coincida con
// el secret SCRAPE_SECRET configurado en Supabase.
// ===========================================================

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SCRAPE_SECRET = Deno.env.get("SCRAPE_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Facultad de Humanidades — se upserta si no existe
const FACULTAD_NOMBRE = "Facultad de Humanidades y Ciencias de la Educación";
const TARGET_URL = "https://www.hum.umss.edu.bo/horarios/";

/** Parsea <option value="codigo">nombre</option> del select#plan */
function parseCarreras(html: string): { codigo: string; nombre: string }[] {
  const carreras: { codigo: string; nombre: string }[] = [];

  // Buscar el <select> con id/name "plan"
  const selectMatch = html.match(/<select[^>]*name=['\"]?plan['\"]?[^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) return carreras;

  const selectHtml = selectMatch[1]!;

  // Extraer cada <option>
  const optionRegex =
    /<option\s+value\s*=\s*["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/option>/gi;
  let match: RegExpExecArray | null;

  while ((match = optionRegex.exec(selectHtml)) !== null) {
    const codigo = match[1]!.trim();
    const nombre = match[2]!.trim();
    // Ignorar opciones vacías o placeholder
    if (codigo && nombre && codigo !== "" && codigo !== "0") {
      carreras.push({ codigo, nombre });
    }
  }

  return carreras;
}

Deno.serve(async (req) => {
  // -- Validar método --
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // -- Validar secret --
  const secret = req.headers.get("x-scrape-secret") ?? "";
  if (!SCRAPE_SECRET || secret !== SCRAPE_SECRET) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // -- 1. Fetch HTML --
    const res = await fetch(TARGET_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Error al obtener la página: ${res.status} ${res.statusText}`
      );
    }

    const html = await res.text();

    // -- 2. Parsear carreras --
    const carreras = parseCarreras(html);

    if (carreras.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No se encontraron carreras en el HTML",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // -- 3. Asegurar facultad existe --
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert facultad
    const { data: facData, error: facError } = await supabase
      .from("facultades")
      .upsert({ nombre: FACULTAD_NOMBRE }, { onConflict: "nombre" })
      .select("id")
      .single();

    if (facError) throw new Error(`Error facultad: ${facError.message}`);

    const facultadId = facData.id;

    // -- 4. Llamar RPC upsert_carreras --
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "upsert_carreras",
      {
        p_facultad_id: facultadId,
        p_carreras: carreras,
      }
    );

    if (rpcError) throw new Error(`Error RPC: ${rpcError.message}`);

    return new Response(
      JSON.stringify({
        ok: true,
        carreras_encontradas: carreras.length,
        carreras,
        db: rpcResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
