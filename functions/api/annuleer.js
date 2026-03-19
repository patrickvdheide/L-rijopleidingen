// annuleer.js — v7
// annuleer.js — v7.0.0
// functions/api/annuleer.js
// Verwerkt annuleringsverzoeken via link in de bevestigingsmail

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/html; charset=utf-8",
};

function pagina(titel, bericht, kleur, icoon) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${titel} — L-Rijopleidingen</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { background:#eef0f5; font-family:'DM Sans',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { background:white; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); padding:40px 32px; max-width:420px; width:90%; text-align:center; }
    .icoon { font-size:48px; margin-bottom:16px; }
    h1 { font-size:20px; font-weight:700; color:#1a1f2e; margin-bottom:8px; }
    p { font-size:14px; color:#6b7280; line-height:1.6; }
    a { display:inline-block; margin-top:20px; background:${kleur}; color:white; text-decoration:none; padding:10px 24px; border-radius:6px; font-weight:600; font-size:14px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icoon">${icoon}</div>
    <h1>${titel}</h1>
    <p>${bericht}</p>
    <a href="/">Nieuwe afspraak maken</a>
  </div>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id    = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  const isHerstel = url.searchParams.get("herstel") === "1";

  if (!id || !token) {
    return new Response(
      pagina("Ongeldige link", "De annuleringslink is ongeldig of verlopen.", "#dc2626", "❌"),
      { status: 400, headers: CORS }
    );
  }

  try {
    // Zoek de boeking op in Airtable via Boekingsnummer
    const zoekRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?filterByFormula=${encodeURIComponent(`{Boekingsnummer}="${id}"`)}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );

    if (!zoekRes.ok) throw new Error("Airtable zoek: " + zoekRes.status);
    const zoekData = await zoekRes.json();
    const record = zoekData.records?.[0];

    if (!record) {
      return new Response(
        pagina("Boeking niet gevonden", `Boeking ${id} is niet gevonden. Mogelijk is deze al geannuleerd.`, "#6b7280", "🔍"),
        { status: 404, headers: CORS }
      );
    }

    // Verifieer token (eenvoudige hash van id)
    const verwacht = btoa(id).replace(/=/g,"").slice(0,12);
    if (token !== verwacht) {
      return new Response(
        pagina("Ongeldige link", "De annuleringslink is niet geldig.", "#dc2626", "❌"),
        { status: 403, headers: CORS }
      );
    }

    // Update status
    const nieuweStatus = isHerstel ? "Bevestigd" : "Geannuleerd";
    const updateRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${record.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: { "Status": nieuweStatus }
        }),
      }
    );

    if (!updateRes.ok) throw new Error("Airtable update: " + updateRes.status);

    const datum = record.fields?.Datum || "";
    const naam  = record.fields?.Naam  || "Klant";

    return new Response(
      isHerstel
        ? pagina(
            "Annulering ongedaan gemaakt",
            `Beste ${naam}, de annulering van uw afspraak van ${datum} is ongedaan gemaakt. Uw afspraak staat weer op de planning.`,
            "#16a34a",
            "✅"
          )
        : pagina(
            "Afspraak geannuleerd",
            `Beste ${naam}, uw afspraak van ${datum} is succesvol geannuleerd. U ontvangt geen verdere bevestiging.`,
            "#2c6bed",
            "✅"
          ),
      { status: 200, headers: CORS }
    );

  } catch(err) {
    console.error("Annuleer fout:", err.message);
    return new Response(
      pagina("Er ging iets mis", "Probeer het later opnieuw of neem contact op met de rijschool.", "#dc2626", "⚠️"),
      { status: 500, headers: CORS }
    );
  }
}
