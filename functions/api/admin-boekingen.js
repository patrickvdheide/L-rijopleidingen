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

  // Controleer admin wachtwoord
  const adminKey = request.headers.get("x-admin-key");
  const adminPwd = env.ADMIN_PASSWORD || "rijschool2026";
  if (adminKey !== adminPwd) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }

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
