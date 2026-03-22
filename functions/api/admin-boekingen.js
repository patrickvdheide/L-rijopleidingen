// functions/api/admin-boekingen.js

import { getAlleBoekingen, getAdmin } from "./_db.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  // ── Sessie verificatie ──
  const url    = new URL(request.url);
  const _token = url.searchParams.get("key");
  const _user  = url.searchParams.get("user");
  if (!_token || !_user) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });

  const admin = await getAdmin(db, _user);
  if (!admin || !(admin.reset_token || "").startsWith("sessie_" + _token) || new Date(admin.reset_verloopt) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }

  try {
    const rijen = await getAlleBoekingen(db);
    // Zet om naar Airtable-achtig formaat zodat admin.html geen aanpassingen nodig heeft
    const boekingen = rijen.map(r => ({
      id:     String(r.id),
      fields: {
        Boekingsnummer: r.boekingsnummer,
        Naam:           r.naam,
        Email:          r.email,
        Telefoon:       r.telefoon,
        Klanttype:      r.klanttype,
        Datum:          r.datum,
        Tijdsloten:     r.tijdsloten,
        Diensten:       r.diensten,
        Opties:         r.opties,
        Betaalmethode:  r.betaalmethode,
        Totaal:         r.totaal,
        Bedrijfsnaam:   r.bedrijfsnaam,
        KVK:            r.kvk,
        Straat:         r.straat,
        Huisnummer:     r.huisnummer,
        Postcode:       r.postcode,
        Plaats:         r.plaats,
        Status:         r.status || "Actief",
        "Aangemaakt op": r.aangemaakt,
      },
    }));
    return new Response(JSON.stringify({ boekingen }), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
