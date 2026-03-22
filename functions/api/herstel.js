// functions/api/herstel.js
// Herstel een geannuleerde boeking via e-maillink

import { getBoeking, updateBoeking } from "./_db.js";

const CORS = { "Content-Type": "text/html; charset=utf-8" };

function pagina(titel, bericht, kleur, icoon) {
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${titel} — L-Rijopleidingen</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body{background:#eef0f5;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:40px 32px;max-width:420px;width:90%;text-align:center}.icoon{font-size:48px;margin-bottom:16px}h1{font-size:20px;font-weight:700;color:#1a1f2e;margin-bottom:8px}p{font-size:14px;color:#6b7280;line-height:1.6}a{display:inline-block;margin-top:20px;background:${kleur};color:white;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px}</style>
  </head><body><div class="box"><div class="icoon">${icoon}</div><h1>${titel}</h1><p>${bericht}</p><a href="/">Terug naar boekingen</a></div></body></html>`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url   = new URL(request.url);
  const id    = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!id || !token) return new Response(pagina("Ongeldige link", "De herstelLink is ongeldig.", "#dc2626", "❌"), { status: 400, headers: CORS });

  const verwacht = btoa(id).replace(/=/g, "").slice(0, 12);
  if (token !== verwacht) return new Response(pagina("Ongeldige link", "De herstelLink is niet geldig.", "#dc2626", "❌"), { status: 403, headers: CORS });

  try {
    const bk = await getBoeking(db, id);
    if (!bk) return new Response(pagina("Niet gevonden", `Boeking ${id} is niet gevonden.`, "#6b7280", "🔍"), { status: 404, headers: CORS });

    await updateBoeking(db, id, { status: "Actief" });

    if (bk.email && env.RESEND_KEY) {
      const logo = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;"/>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
          to: [bk.email],
          subject: `Afspraak hersteld — ${bk.boekingsnummer}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#eef0f5;padding:32px 16px;">
            <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;margin:0 auto;">
              <tr><td style="background:#16a34a;padding:20px 32px;">${logo}</td></tr>
              <tr><td style="padding:32px;"><h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2e;">✅ Afspraak hersteld</h1>
              <p style="color:#6b7280;">Beste ${bk.naam}, uw afspraak van ${bk.datum} is hersteld en staat weer op de planning.</p></td></tr>
            </table></body></html>`,
        }),
      }).catch(() => {});
    }

    return new Response(pagina("Afspraak hersteld", `Beste ${bk.naam}, uw afspraak van ${bk.datum} is hersteld en staat weer op de planning.`, "#16a34a", "✅"), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(pagina("Er ging iets mis", "Probeer het later opnieuw.", "#dc2626", "⚠️"), { status: 500, headers: CORS });
  }
}
