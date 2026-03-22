// functions/api/annuleer.js

import { getBoeking, updateBoeking } from "./_db.js";

const CORS = { "Content-Type": "text/html; charset=utf-8" };

function pagina(titel, bericht, kleur, icoon) {
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${titel} — L-Rijopleidingen</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body{background:#eef0f5;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:40px 32px;max-width:420px;width:90%;text-align:center}.icoon{font-size:48px;margin-bottom:16px}h1{font-size:20px;font-weight:700;color:#1a1f2e;margin-bottom:8px}p{font-size:14px;color:#6b7280;line-height:1.6}a{display:inline-block;margin-top:20px;background:${kleur};color:white;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px}</style>
  </head><body><div class="box"><div class="icoon">${icoon}</div><h1>${titel}</h1><p>${bericht}</p><a href="/">Nieuwe afspraak maken</a></div></body></html>`;
}

async function maakHmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const id    = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!id || !token) return new Response(pagina("Ongeldige link", "De annuleringslink is ongeldig.", "#dc2626", "❌"), { status: 400, headers: CORS });

  const secret   = env.ANNULEER_SECRET || "lrijo-annuleer-2026";
  const verwacht = await maakHmac(id, secret);
  if (token !== verwacht) return new Response(pagina("Ongeldige link", "De annuleringslink is niet geldig.", "#dc2626", "❌"), { status: 403, headers: CORS });

  try {
    const bk = await getBoeking(db, id);
    if (!bk) return new Response(pagina("Niet gevonden", `Boeking ${id} is niet gevonden of al verwerkt.`, "#6b7280", "🔍"), { status: 404, headers: CORS });

    await updateBoeking(db, id, { status: "Geannuleerd" });

    return new Response(pagina(
      "Afspraak geannuleerd",
      `Beste ${bk.naam}, uw afspraak van ${bk.datum} is succesvol geannuleerd.`,
      "#0586f0", "✅"
    ), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(pagina("Er ging iets mis", "Probeer het later opnieuw of neem contact op met de rijschool.", "#dc2626", "⚠️"), { status: 500, headers: CORS });
  }
}
