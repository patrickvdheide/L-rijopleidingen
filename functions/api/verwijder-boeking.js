// functions/api/verwijder-boeking.js

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  // ── Sessie verificatie ──
  const _authHeader = request.headers.get("Authorization") || "";
  const _token = _authHeader.startsWith("Bearer ") ? _authHeader.slice(7).trim() : "";
  const _user  = (request.headers.get("X-Admin-User") || "").trim();
  if (!_token || !_user) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _safeUser = _user.replace(/["\\]/g, "");
  const _ar = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tblxPXaRSgAHiiauP?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="' + _safeUser + '"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(() => null);
  if (!_ar?.ok) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _ad = await _ar.json();
  const _rec = _ad.records?.[0];
  if (!_rec || !(_rec.fields?.ResetToken || "").startsWith("sessie_" + _token) || new Date(_rec.fields?.ResetVerloopt || 0) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }
  // ── Einde verificatie ──

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { recordId } = body;
  if (!recordId) return new Response(JSON.stringify({ error: "recordId ontbreekt" }), { status: 400, headers: CORS });

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${recordId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: "Airtable: " + err }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
