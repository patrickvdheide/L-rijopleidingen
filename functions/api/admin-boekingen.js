// functions/api/admin-boekingen.js

const ALLOWED_ORIGINS = ["https://boekingen.l-rijopleidingen.nl","https://l-rijopleidingen.pages.dev"];
function corsHeaders(req) {
  const origin = req?.headers?.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User", "Access-Control-Allow-Methods": "GET, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" };
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

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?maxRecords=500&sort[0][field]=Aangemaakt+op&sort[0][direction]=desc`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    if (!res.ok) throw new Error("Airtable: " + res.status);
    const data = await res.json();
    return new Response(JSON.stringify({ boekingen: data.records || [] }), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
