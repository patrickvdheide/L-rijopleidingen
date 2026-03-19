// functions/api/herstel.js
// Maakt een annulering ongedaan via link in de annuleringsbevestiging

const CORS = { "Content-Type": "text/html; charset=utf-8" };

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
    <a href="/">Terug naar boekingen</a>
  </div>
</body>
</html>`;
}

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function formatDatum(str) {
  if (!str) return "—";
  const [j,m,d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m)-1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const id    = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!id || !token) {
    return new Response(pagina("Ongeldige link", "De herstelLink is ongeldig of verlopen.", "#dc2626", "❌"), { status: 400, headers: CORS });
  }

  // Verifieer token
  const verwacht = btoa(id).replace(/=/g,"").slice(0,12);
  if (token !== verwacht) {
    return new Response(pagina("Ongeldige link", "De herstelLink is niet geldig.", "#dc2626", "❌"), { status: 403, headers: CORS });
  }

  try {
    // Zoek de boeking op
    const zoekRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?filterByFormula=${encodeURIComponent(`{Boekingsnummer}="${id}"`)}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    if (!zoekRes.ok) throw new Error("Airtable zoek: " + zoekRes.status);
    const zoekData = await zoekRes.json();
    const record   = zoekData.records?.[0];

    if (!record) {
      return new Response(pagina("Boeking niet gevonden", `Boeking ${id} is niet gevonden.`, "#6b7280", "🔍"), { status: 404, headers: CORS });
    }

    const status = record.fields?.Status;
    if (status !== "Geannuleerd") {
      return new Response(pagina("Al actief", "Deze afspraak is niet geannuleerd of is al hersteld.", "#16a34a", "✅"), { status: 200, headers: CORS });
    }

    // Herstel de boeking
    const updateRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${record.id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { "Status": "Actief" } }),
      }
    );
    if (!updateRes.ok) throw new Error("Airtable update: " + updateRes.status);

    // Stuur herstelbevestiging
    const naam  = record.fields?.Naam  || "Klant";
    const email = record.fields?.Email || "";
    const datum = record.fields?.Datum || "";

    if (email && env.RESEND_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    (env.RESEND_FROM || "").trim(),
          to:      [email],
          subject: `Afspraak hersteld — ${id}`,
          html:    `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
          <body style="margin:0;padding:32px;background:#f5f6f8;font-family:Arial,sans-serif;">
            <div style="max-width:500px;margin:0 auto;background:white;border-radius:8px;border:1px solid #dde1e9;overflow:hidden;">
              <div style="background:#16a34a;padding:20px 32px;">
                <p style="margin:0;color:white;font-size:18px;font-weight:700;">✅ Afspraak hersteld</p>
                <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">L-Rijopleidingen</p>
              </div>
              <div style="padding:24px 32px;">
                <p style="font-size:14px;color:#1a1f2e;line-height:1.6;">Beste ${naam},<br><br>
                De annulering van uw afspraak op <strong>${formatDatum(datum)}</strong> (boekingsnummer <strong>${id}</strong>) is ongedaan gemaakt.<br><br>
                Uw afspraak staat weer actief. Neem contact op via <a href="mailto:info@l-rijopleidingen.nl">info@l-rijopleidingen.nl</a> bij vragen.</p>
              </div>
              <div style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · info@l-rijopleidingen.nl</p>
              </div>
            </div>
          </body></html>`
        }),
      });
    }

    return new Response(
      pagina("Afspraak hersteld", `Beste ${naam}, uw afspraak van ${formatDatum(datum)} is succesvol hersteld. U ontvangt een bevestigingsmail.`, "#16a34a", "✅"),
      { status: 200, headers: CORS }
    );

  } catch(err) {
    console.error("Herstel fout:", err.message);
    return new Response(pagina("Er ging iets mis", "Probeer het later opnieuw of neem contact op met de rijschool.", "#dc2626", "⚠️"), { status: 500, headers: CORS });
  }
}
