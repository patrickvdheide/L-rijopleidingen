// functions/api/bezet.js
// Publiek endpoint: bezette tijdsloten voor actieve boekingen

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

  const vandaag = new Date().toISOString().slice(0, 10);

  try {
    const { results } = await db.prepare(
      "SELECT datum, tijdsloten, boekingsnummer FROM boekingen WHERE status != 'Geannuleerd' AND datum >= ?"
    ).bind(vandaag).all();

    const bezet = {};
    for (const rij of results) {
      const { datum, tijdsloten, boekingsnummer } = rij;
      if (!datum || !tijdsloten) continue;
      const tijdMatch = tijdsloten.match(/(\d{2}:\d{2})\s*(?:[–-]\s*(\d{2}:\d{2}))?/);
      if (!tijdMatch) continue;
      const [sh] = tijdMatch[1].split(":").map(Number);
      const [eh] = (tijdMatch[2] || tijdMatch[1]).split(":").map(Number);
      for (let h = sh; h <= eh; h++) {
        bezet[datum + "||" + String(h).padStart(2,"0") + ":00"] = boekingsnummer || "bezet";
      }
    }

    return new Response(JSON.stringify({ bezet }), {
      status: 200,
      headers: { ...CORS, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ bezet: {}, error: err.message }), { status: 200, headers: CORS });
  }
}
