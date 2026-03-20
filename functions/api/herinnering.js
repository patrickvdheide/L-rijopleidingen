// functions/api/herinnering.js
// Stuur herinneringsmails voor afspraken van morgen
// Aanroepen via: GET /api/herinnering?secret=CRON_SECRET
// Stel een dagelijks cron in via cron-job.org of Cloudflare Worker

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  // Beveilig met secret zodat alleen de cron dit kan aanroepen
  const url    = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Bereken datum van morgen in NL formaat (YYYY-MM-DD)
  const morgen = new Date();
  morgen.setDate(morgen.getDate() + 1);
  const morgenStr = morgen.toISOString().slice(0, 10);

  // Haal alle actieve boekingen van morgen op
  const filter = encodeURIComponent(`AND({Datum}="${morgenStr}", {Status}!="Geannuleerd", {Herinnerd}!=1)`);
  const atRes = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?filterByFormula=${filter}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(() => null);

  if (!atRes?.ok) {
    return new Response(JSON.stringify({ error: "Airtable fout" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data     = await atRes.json();
  const records  = data.records || [];
  const verstuurd = [];
  const fouten    = [];

  for (const rec of records) {
    const f = rec.fields;
    if (!f.Email) continue;

    const icalUrl = `https://boekingen.l-rijopleidingen.nl/api/ical?id=${f.Boekingsnummer}`;

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;overflow:hidden;">
        <tr><td style="background:#0586f0;padding:20px 32px;">
          <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;display:block;margin-bottom:6px;"/>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Herinnering — afspraak morgen</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fffbeb;border-bottom:1px solid #fde68a;">
          <p style="margin:0;font-size:15px;font-weight:600;color:#92400e;">⏰ Morgen is uw afspraak</p>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Boekingsnummer: <strong style="color:#0586f0;">${f.Boekingsnummer}</strong></p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="font-size:14px;color:#1a1f2e;margin:0 0 16px;">Beste ${f.Naam},<br><br>Dit is een herinnering voor uw afspraak bij L-Rijopleidingen <strong>morgen, ${formatDatum(f.Datum)}</strong>.</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ["Datum",      formatDatum(f.Datum)],
              ["Tijdsloten", f.Tijdsloten || "—"],
              ["Dienst",     f.Diensten   || "—"],
              ...(f.Opties ? [["Opties", f.Opties]] : []),
              ["Betaling",   f.Betaalmethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
              ["Bedrag",     "€ " + Number(f.Totaal || 0).toFixed(2) + (f.Klanttype === "consument" ? " incl. btw" : " excl. btw")],
            ].map(([l, v]) => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;">${l}</td>
              <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;font-weight:500;">${v}</td>
            </tr>`).join("")}
          </table>
          <div style="margin-top:20px;text-align:center;">
            <a href="${icalUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">📅 Voeg toe aan agenda</a>
          </div>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:14px 32px;border-top:1px solid #dde1e9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;"><img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:18px;width:auto;vertical-align:middle;margin-right:6px;"/>info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    (env.RESEND_FROM || "").trim(),
          to:      [f.Email],
          subject: `Herinnering: afspraak morgen ${formatDatum(f.Datum)} — ${f.Boekingsnummer}`,
          html,
        }),
      });

      if (mailRes.ok) {
        // Markeer als herinnerd in Airtable
        await fetch(
          `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${rec.id}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: { Herinnerd: true } }),
          }
        );
        verstuurd.push(f.Boekingsnummer);
      } else {
        fouten.push(f.Boekingsnummer);
      }
    } catch (err) {
      fouten.push(f.Boekingsnummer + ": " + err.message);
    }
  }

  return new Response(
    JSON.stringify({ datum: morgenStr, verstuurd, fouten, totaal: records.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
