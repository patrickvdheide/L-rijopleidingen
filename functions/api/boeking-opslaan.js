// functions/api/boeking-opslaan.js

import { maakBoeking, volgendBoekingsnummer } from "./_db.js";

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

async function maakHmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let boeking;
  try { boeking = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const { kt, naam, email, tel, bedrijf, kvk, straat, huisnummer, postcode, plaats,
          diensten, dienstLabels, opties, optieLabels, datum, slots, betaalMethode, p: prijs } = boeking;

  // Genereer volgnummer server-side
  const id = await volgendBoekingsnummer(db, datum || new Date().toISOString().slice(0, 10));

  const annuleerSecret = env.ANNULEER_SECRET || "lrijo-annuleer-2026";
  const cancelToken    = await maakHmac(id, annuleerSecret);
  const cancelUrl      = `${BASE_URL}/api/annuleer?id=${id}&token=${cancelToken}`;

  const slotsLabel  = slots?.length > 0 ? `${slots[0]}${slots.length > 1 ? ` – ${slots[slots.length - 1]}` : ""} (${slots.length}×)` : "—";
  const dienstenStr = (dienstLabels || diensten || []).join(", ");
  const optiesStr   = (optieLabels  || opties   || []).join(", ");
  const totaal      = Number((prijs?.totaal || prijs?.tot || 0).toFixed(2));
  const adresStr    = [straat, huisnummer, postcode, plaats].filter(Boolean).join(", ");
  const ktLabel     = { consument: "Cursist", zzp: "Instructeur", bedrijf: "Rijschoolhouder" }[kt] || kt;
  const vanaf       = "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">";

  const icalParams = new URLSearchParams({
    datum, id,
    start:   slots?.[0] || "09:00",
    eind:    (() => {
      const last = slots?.[slots.length-1] || "10:00";
      const [h, m] = last.split(":").map(Number);
      return String((h+1)%24).padStart(2,"0")+":"+String(m).padStart(2,"0");
    })(),
    naam:    naam    || "",
    email:   email   || "",
    dienst:  dienstenStr,
    opties:  optiesStr,
    betaling: betaalMethode || "",
    totaal:  String(totaal),
  });
  const icalUrl = `${BASE_URL}/api/ical?${icalParams.toString()}`;

  // Sla op in D1
  try {
    await maakBoeking(db, {
      boekingsnummer: id,
      naam, email,
      telefoon:    tel || null,
      klanttype:   kt,
      datum,
      tijdsloten:  slotsLabel,
      diensten:    dienstenStr,
      opties:      optiesStr || null,
      betaalmethode: betaalMethode === "pin" ? "pin" : "contant",
      totaal,
      bedrijfsnaam: bedrijf || null,
      kvk:         kvk || null,
      straat:      straat || null,
      huisnummer:  huisnummer ? String(huisnummer) : null,
      postcode:    postcode || null,
      plaats:      plaats || null,
      adres:       adresStr || null,
      status:      "Actief",
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Opslaan mislukt: " + err.message }), { status: 500, headers: CORS });
  }

  // ── E-MAILS ──
  const btwRegel = kt === "consument"
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">BTW 21%</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1a1f2e;">€ ${(totaal - totaal/1.21).toFixed(2)}</td></tr>`
    : `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">BTW</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1a1f2e;">Excl. — facturabel</td></tr>`;

  const rijen = [
    ["Boekingsnummer", id],
    ["Klanttype",      ktLabel],
    ["Datum",          formatDatum(datum)],
    ["Tijdsloten",     slotsLabel],
    ["Diensten",       dienstenStr],
    opties?.length ? ["Opties", optiesStr] : null,
    ["Betaalmethode",  betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
    adresStr ? ["Adres", adresStr] : null,
    bedrijf  ? ["Bedrijf", bedrijf] : null,
    kvk      ? ["KVK", kvk] : null,
  ].filter(Boolean).map(([l,v]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${l}</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#1a1f2e;">${v}</td></tr>`
  ).join("");

  const logo = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;"/>`;
  const logoZwart = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:24px;width:auto;"/>`;

  const bevestigingHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#eef0f5;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0586f0;padding:20px 32px;">${logo}</td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 8px;font-size:22px;color:#1a1f2e;">Afspraak bevestigd ✓</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Bedankt voor uw boeking! Hieronder vindt u een overzicht.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${rijen}${btwRegel}
      <tr><td style="padding:12px 0;color:#1a1f2e;font-weight:700;font-size:16px;">Totaal te betalen op locatie</td><td style="padding:12px 0;font-weight:700;font-size:20px;color:#0586f0;">€ ${totaal.toFixed(2)}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:8px;"><a href="${icalUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">📅 Toevoegen aan agenda</a></td>
      <td><a href="${cancelUrl}" style="display:inline-block;background:#f5f6f8;color:#6b7280;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;border:1px solid #dde1e9;">Annuleren</a></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid #eef0f5;text-align:center;">${logoZwart}<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · info@l-rijopleidingen.nl</p></td></tr>
</table></td></tr></table></body></html>`;

  const adminHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"/></head><body style="margin:0;padding:0;background:#eef0f5;font-family:'DM Sans',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#1a1f2e;padding:20px 32px;">${logo}</td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2e;">🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}</h1>
    <table width="100%" cellpadding="0" cellspacing="0">${rijen}${btwRegel}
      <tr><td style="padding:12px 0;font-weight:700;font-size:16px;color:#1a1f2e;">Totaal</td><td style="padding:12px 0;font-weight:700;font-size:18px;color:#0586f0;">€ ${totaal.toFixed(2)}</td></tr>
    </table>
  </td></tr>
</table></td></tr></table></body></html>`;

  await Promise.allSettled([
    fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: vanaf, to: [email],
        subject: `Afspraak bevestigd — ${formatDatum(datum)} · ${slotsLabel} (${id})`,
        html: bevestigingHtml,
      }),
    }),
    fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: vanaf, to: [env.RESEND_FROM],
        subject: `🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}`,
        html: adminHtml,
      }),
    }),
  ]);

  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}
