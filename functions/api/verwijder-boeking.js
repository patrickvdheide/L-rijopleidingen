// functions/api/verwijder-boeking.js
// Verwijdert een boeking definitief uit Airtable

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  // Verifieer sessie token
  const url   = new URL(request.url);
  const token = url.searchParams.get("key");
  const user  = url.searchParams.get("user");
  if (!token || !user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const authRes = await fetch(new URL("/api/admin-auth", request.url).href, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({actie:"verifieer", token, gebruikersnaam:user})
  }).catch(()=>null);
  const authData = authRes ? await authRes.json() : {};
  if (!authRes?.ok || !authData.geldig) {
    return new Response(JSON.stringify({ error: "Sessie verlopen" }), { status: 401, headers: CORS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { recordId } = body;
  if (!recordId) {
    return new Response(JSON.stringify({ error: "recordId ontbreekt" }), { status: 400, headers: CORS });
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${recordId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Airtable verwijder fout:", res.status, err);
      return new Response(JSON.stringify({ error: "Airtable: " + err }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  } catch (err) {
    console.error("Verwijder exception:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
