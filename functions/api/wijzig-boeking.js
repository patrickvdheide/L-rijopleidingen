// functions/api/wijzig-boeking.js

import { getBoeking, updateBoeking, getAdmin } from "./_db.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  // ── Sessie verificatie ──
  const url    = new URL(request.url);
  const _token = url.searchParams.get("key");
  const _user  = url.searchParams.get("user");
  if (!_token || !_user) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });

  const admin = await getAdmin(db, _user);
  if (!admin || !(admin.reset_token || "").startsWith("sessie_" + _token) || new Date(admin.reset_verloopt) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const { recordId, velden, annuleer, herstel, email, naam, boekingsnummer } = body;

  // Zoek boeking op via boekingsnummer (recordId is de D1 row id als string)
  const bk = boekingsnummer
    ? await getBoeking(db, boekingsnummer)
    : await db.prepare("SELECT * FROM boekingen WHERE id = ? LIMIT 1").bind(recordId).first();

  if (!bk) return new Response(JSON.stringify({ error: "Boeking niet gevonden" }), { status: 404, headers: CORS });

  // Bepaal nieuwe status
  const nieuweStatus = annuleer ? "Geannuleerd" : herstel ? "Actief" : "Gewijzigd";

  // Bouw update velden
  const updateVelden = { status: nieuweStatus };
  if (!annuleer && !herstel && velden) {
    if (velden.Datum)          updateVelden.datum         = velden.Datum;
    if (velden.Tijdsloten)     updateVelden.tijdsloten    = velden.Tijdsloten;
    if (velden.Diensten)       updateVelden.diensten      = velden.Diensten;
    if (velden.Opties !== undefined) updateVelden.opties  = velden.Opties;
    if (velden.Betaalmethode)  updateVelden.betaalmethode = velden.Betaalmethode;
    if (velden.Totaal !== undefined) updateVelden.totaal  = Number(velden.Totaal) || 0;
  }

  await updateBoeking(db, bk.boekingsnummer, updateVelden);

  // Mail sturen
  if (email && env.RESEND_KEY) {
    const kleur   = annuleer ? "#dc2626" : herstel ? "#16a34a" : "#0586f0";
    const ikoon   = annuleer ? "❌" : herstel ? "✅" : "✏️";
    const koptekst = annuleer ? "Uw afspraak is geannuleerd" : herstel ? "Uw afspraak is hersteld" : "Uw afspraak is gewijzigd";
    const datum   = updateVelden.datum || bk.datum;
    const logo    = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;"/>`;

    const rijHtml = !annuleer && velden ? Object.entries(velden).map(([k,v]) =>
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:130px;">${k}</td><td style="padding:6px 0;font-size:13px;color:#1a1f2e;">${v}</td></tr>`
    ).join("") : "";

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;">
  <tr><td style="background:${kleur};padding:20px 32px;">${logo}</td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2e;">${ikoon} ${koptekst}</h1>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Beste ${naam || "klant"}, uw afspraak van ${formatDatum(datum)} is bijgewerkt.</p>
    ${rijHtml ? `<table width="100%" cellpadding="0" cellspacing="0">${rijHtml}</table>` : ""}
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;">Vragen? Neem contact op via info@l-rijopleidingen.nl</p>
  </td></tr>
</table></td></tr></table></body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
        to: [email],
        subject: annuleer ? `Afspraak geannuleerd — ${bk.boekingsnummer}` : herstel ? `Afspraak hersteld — ${bk.boekingsnummer}` : `Afspraak gewijzigd — ${bk.boekingsnummer}`,
        html,
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
}
