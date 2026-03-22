// functions/api/verwijder-boeking.js

import { verwijderBoeking, getAdmin } from "./_db.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  const url    = new URL(request.url);
  const _token = url.searchParams.get("key");
  const _user  = url.searchParams.get("user");
  if (!_token || !_user) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });

  const admin = await getAdmin(db, _user);
  if (!admin || !(admin.reset_token || "").startsWith("sessie_" + _token) || new Date(admin.reset_verloopt) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  // recordId kan een D1 row id zijn, maar we verwijderen altijd op boekingsnummer
  const { recordId, boekingsnummer } = body;
  const nr = boekingsnummer || await (async () => {
    const rij = await env.DB.prepare("SELECT boekingsnummer FROM boekingen WHERE id = ? LIMIT 1").bind(recordId).first();
    return rij?.boekingsnummer;
  })();

  if (!nr) return new Response(JSON.stringify({ error: "Boeking niet gevonden" }), { status: 404, headers: CORS });

  await verwijderBoeking(db, nr);
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
