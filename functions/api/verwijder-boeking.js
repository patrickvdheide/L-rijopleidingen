// functions/api/verwijder-boeking.js

const ALLOWED_ORIGINS = ["https://boekingen.l-rijopleidingen.nl","https://l-rijopleidingen.pages.dev"];
function corsHeaders(req) {
  const origin = req?.headers?.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" };
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = corsHeaders(request);

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
