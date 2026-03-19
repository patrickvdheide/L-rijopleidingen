// admin-boekingen.js — v7
// admin-boekingen.js — v7.0.0
// functions/api/admin-boekingen.js
// Geeft boekingen terug uit Airtable voor de beheerpagina

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Content-Type": "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }


  // ── Sessie verificatie ──
  const _url   = new URL(request.url);
  const _token = _url.searchParams.get("key");
  const _user  = _url.searchParams.get("user");
  if (!_token || !_user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const _ar = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tblxPXaRSgAHiiauP?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="'+_user+'"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(()=>null);
  if (!_ar?.ok) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _ad = await _ar.json();
  const _ar2 = _ad.records?.[0];
  if (!_ar2 || !(_ar2.fields?.ResetToken||"").startsWith("sessie_"+_token) || new Date(_ar2.fields?.ResetVerloopt||0) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }
  // ── Einde verificatie ──


  try {
    const res = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?maxRecords=200`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("Airtable fout:", res.status, errText);
      throw new Error("Airtable: " + res.status + " — " + errText);
    }
    const data = await res.json();
    return new Response(JSON.stringify({ boekingen: data.records || [] }), { status: 200, headers: CORS });
  } catch(err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
