// functions/api/boeking-opslaan.js

import { volgendBoekingsnummer } from "./_db.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

const BASE_URL = "https://reserveren.l-rijopleidingen.nl";
const RESEND   = "https://api.resend.com/emails";
const MAANDEN  = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let boeking;
  try { boeking = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const {
    naam, email, tel, bedrijf, opleidingsnummer,
    cursisten, aantalCursisten,
    diensten, dienstLabels, opties, optieLabels,
    datum, tijdblok, betaalMethode, totaal: totaalIn,
  } = boeking;

  const id          = await volgendBoekingsnummer(db, datum || new Date().toISOString().slice(0, 10));
  const dienstenStr = (dienstLabels || diensten || []).join(", ");
  const optiesStr   = (optieLabels  || opties   || []).join(", ");
  const totaal      = Number(Number(totaalIn || 0).toFixed(2));
  const aantalC     = aantalCursisten || (cursisten ? cursisten.length : 1);
  const slotsLabel  = tijdblok?.label || tijdblok || "—";
  const vanaf       = "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">";

  // Sla op in D1
  try {
    await db.prepare(`
      INSERT INTO boekingen
        (boekingsnummer, naam, email, telefoon, klanttype, datum, tijdsloten,
         diensten, opties, betaalmethode, totaal, bedrijfsnaam,
         opleidingsnummer, cursisten_json, aantal_cursisten, status, aangemaakt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, naam || "", email || "", tel || null, "bedrijf",
      datum || "", slotsLabel, dienstenStr || "", optiesStr || null,
      betaalMethode === "pin" ? "pin" : "contant", totaal,
      bedrijf || null, opleidingsnummer || null,
      cursisten ? JSON.stringify(cursisten) : null,
      aantalC, "Actief", new Date().toISOString(),
    ).run();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Opslaan mislukt: " + err.message }), { status: 500, headers: CORS });
  }

  // ── Bevestigingsmail klant ──
  const logo      = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;display:block;"/>`;
  const logoZwart = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:24px;width:auto;display:block;"/>`;

  const basisRijen = [
    ["Boekingsnummer", id],
    ["Datum",          formatDatum(datum)],
    ["Tijdblok",       slotsLabel],
    ["Dienst",         dienstenStr],
    opties?.length ? ["Opties", optiesStr] : null,
    ["Betaling",       betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
    bedrijf          ? ["Rijschool",         bedrijf]          : null,
    opleidingsnummer ? ["Opleidingsnummer",   opleidingsnummer] : null,
    aantalC          ? ["Aantal cursisten",   String(aantalC)]  : null,
  ].filter(Boolean);

  const cursistenRijen = cursisten?.length
    ? cursisten.map((c, i) => [
        `Cursist ${i+1}`,
        `${c.voornaam} ${c.achternaam} · ${c.email} · ${c.tel}`
      ])
    : [];

  const alleRijen = [...basisRijen, ...cursistenRijen]
    .map(([l, v]) => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">${l}</td>
        <td style="padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1a1f2e;">${v}</td>
      </tr>`).join("");

  const klantMail = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#0586f0;padding:20px 32px;">${logo}</td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 6px;font-size:22px;color:#1a1f2e;">Reservering bevestigd ✓</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">Bedankt voor uw reservering bij L-Rijopleidingen. Hieronder het overzicht.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">${alleRijen}</table>
          <table cellpadding="0" cellspacing="0"><tr>
            <td><div style="background:#f5f6f8;color:#1a1f2e;padding:10px 0;font-size:14px;font-weight:700;">
              Totaal: <span style="color:#0586f0;">€ ${totaal.toFixed(2)}</span>
              <span style="font-size:12px;font-weight:400;color:#9ca3af;"> excl. BTW · facturabel</span>
            </div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">${logoZwart}<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · info@l-rijopleidingen.nl</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const adminMail = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1f2e;padding:20px 32px;">${logo}</td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#1a1f2e;">🔔 Nieuwe reservering — ${bedrijf || naam}</h1>
          <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${formatDatum(datum)} · ${slotsLabel}</p>
          <table width="100%" cellpadding="0" cellspacing="0">${alleRijen}</table>
          <p style="margin:16px 0 0;font-size:14px;font-weight:700;color:#0586f0;">Totaal: € ${totaal.toFixed(2)} excl. BTW</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await Promise.allSettled([
    fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: vanaf, to: [email], subject: `Reservering bevestigd — ${formatDatum(datum)} (${id})`, html: klantMail }),
    }),
    fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: vanaf, to: [env.RESEND_FROM], subject: `🔔 Reservering: ${bedrijf || naam} — ${formatDatum(datum)} ${slotsLabel}`, html: adminMail }),
    }),
  ]);

  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}
