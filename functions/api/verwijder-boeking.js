// verwijder-boeking.js — v7
// verwijder-boeking.js — v7.0.0
// functions/api/verwijder-boeking.js
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  const reqUrl = new URL(request.url);
  const token = reqUrl.searchParams.get("key");
  const user = reqUrl.searchParams.get("user");

  if (!token || !user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }

  const formule = encodeURIComponent('{Gebruikersnaam}="' + user + '"');
  const atRes = await fetch(
    "https://api.airtable.com/v0/appchbjgwoZQiQjfv/tblxPXaRSgAHiiauP?filterByFormula=" + formule,
    { headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN } }
  ).catch(() => null);

  if (!atRes || !atRes.ok) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }

  const atData = await atRes.json();
  const adminRecord = atData.records && atData.records[0];

  if (!adminRecord) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }

  const opgeslagen = adminRecord.fields.ResetToken || "";
  const verloopt = adminRecord.fields.ResetVerloopt || "";

  if (!opgeslagen.startsWith("sessie_" + token)) {
    return new Response(JSON.stringify({ error: "Sessie verlopen" }), { status: 401, headers: CORS });
  }

  if (new Date(verloopt) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const recordId = body.recordId;
  if (!recordId) {
    return new Response(JSON.stringify({ error: "recordId ontbreekt" }), { status: 400, headers: CORS });
  }

  const delRes = await fetch(
    "https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/" + recordId,
    { method: "DELETE", headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN } }
  ).catch((e) => { return { ok: false, _err: e.message }; });

  if (!delRes.ok) {
    return new Response(JSON.stringify({ error: "Verwijderen mislukt" }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
