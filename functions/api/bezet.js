// functions/api/bezet.js
// Publiek endpoint: geeft bezette tijdsloten terug voor actieve boekingen
// Geen auth nodig — retourneert alleen datum+tijdslot, geen persoonsgegevens

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  const atToken = env.AIRTABLE_TOKEN;
  const vandaag = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // Haal alle actieve (niet-geannuleerde) boekingen op vanaf vandaag
    const formula = encodeURIComponent(
      `AND({Status}!="Geannuleerd", {Datum}>="${vandaag}")`
    );
    const res = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2` +
      `?filterByFormula=${formula}` +
      `&fields[]=Datum&fields[]=Tijdsloten&fields[]=Boekingsnummer` +
      `&maxRecords=500`,
      { headers: { Authorization: `Bearer ${atToken}` } }
    );

    if (!res.ok) throw new Error("Airtable: " + res.status);
    const data = await res.json();

    // Zet om naar { "YYYY-MM-DD||HH:MM": "BKNR" } map
    const bezet = {};
    for (const rec of data.records || []) {
      const { Datum, Tijdsloten, Boekingsnummer } = rec.fields || {};
      if (!Datum || !Tijdsloten) continue;

      // Tijdsloten formaat: "10:00 – 12:00 (2×)" of "10:00 (1×)"
      // Extraheer start- en eindtijd
      const tijdMatch = Tijdsloten.match(/(\d{2}:\d{2})\s*(?:[–-]\s*(\d{2}:\d{2}))?/);
      if (!tijdMatch) continue;

      const startStr = tijdMatch[1];
      const eindStr  = tijdMatch[2] || startStr;
      const [sh] = startStr.split(":").map(Number);
      const [eh] = eindStr.split(":").map(Number);

      // Markeer elk uur in het bereik als bezet
      for (let h = sh; h <= eh; h++) {
        const t = String(h).padStart(2, "0") + ":00";
        bezet[Datum + "||" + t] = Boekingsnummer || "bezet";
      }
    }

    return new Response(JSON.stringify({ bezet }), {
      status: 200,
      headers: { ...CORS, "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Bij fout: geef lege map terug zodat de wizard niet blokkeert
    return new Response(JSON.stringify({ bezet: {}, error: err.message }), {
      status: 200,
      headers: CORS,
    });
  }
}
