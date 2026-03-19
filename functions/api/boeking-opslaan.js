// boeking-opslaan.js — v7
// boeking-opslaan.js — v7.0.0
// netlify/functions/boeking-opslaan.js
// Instaleer: npm install node-fetch (of gebruik Node 18+ built-in fetch)
//
// Omgevingsvariabelen nodig in Netlify:
//   AIRTABLE_TOKEN        — Airtable API-token
//   AIRTABLE_BASE_ID      — Base-ID (begint met app)
//   AIRTABLE_TABLE_ID     — Table-ID (begint met tbl)
//   RESEND_KEY            — Resend API-sleutel
//   RESEND_FROM           — Afzenderadres, bijv. info@rijschool.nl

const MAANDEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december"
];

function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
  };
  // Preflight — moet als eerste
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  // Alleen POST toestaan
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let boeking;
  try {
    const body = await request.text();
    boeking = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const {
    id, kt, naam, email, tel, bedrijf, kvk,
    diensten, dienstLabels,
    opties, optieLabels,
    datum, slots, betaalMethode, p: prijs,
  } = boeking;

  console.log("Ontvangen datum:", datum, "slots:", slots, "kt:", kt);
  const cancelToken = btoa(id).replace(/=/g,"").slice(0,12);
  const herstelToken = btoa(id + "_herstel").replace(/=/g,"").slice(0,12);
  const herstelUrl = `https://l-rijopleidingen.pages.dev/api/annuleer?id=${id}&token=${cancelToken}&herstel=1`;
  const cancelUrl = `https://l-rijopleidingen.pages.dev/api/annuleer?id=${id}&token=${cancelToken}`;
  const slotsLabel = slots?.length > 0
    ? `${slots[0]}${slots.length > 1 ? ` – ${slots[slots.length - 1]}` : ""} (${slots.length}×)`
    : "—";

  // ── 1. Opslaan in Airtable ──────────────────────────────────────────────────
  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            "Boekingsnummer":  id,
            "Naam":            naam,
            "Email":           email,
            "Telefoon":        String(tel || "").trim(),
            "Klanttype":       kt,
            "Bedrijfsnaam":    bedrijf || "",
            "KVK":             kvk || "",
            "Adres":           [boeking.straat, boeking.huisnummer, boeking.postcode, boeking.plaats].filter(Boolean).join(", ") || "",
            "Datum":           datum ? String(datum).trim() : "",
            "Tijdsloten":      slotsLabel,
            "Diensten":        (dienstLabels || diensten || []).join(", "),
            "Opties":          (optieLabels  || opties  || []).join(", "),
            "Betaalmethode":   betaalMethode === "pin" ? "pin" : "contant",
            "Totaal":          Number((prijs?.totaal || prijs?.tot || 0).toFixed(2)),
            "Aangemaakt op":   new Date().toISOString(),
          },
        }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error("Airtable fout status:", airtableRes.status);
      console.error("Airtable fout body:", err);
      return new Response(JSON.stringify({ error: "Airtable: " + airtableRes.status + " — " + err }), { status: 500, headers: CORS });
    } else {
      console.log("Airtable: record opgeslagen");
    }
  } catch (err) {
    console.error("Airtable exception:", err.message);
    return new Response(JSON.stringify({ error: "Airtable exception: " + err.message }), { status: 500, headers: CORS });
  }

  // ── 2. E-mailbevestiging via Resend ─────────────────────────────────────────
  const emailHtml = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Afspraak bevestigd</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;">

        <!-- Header -->
        <tr><td style="background:#2c6bed;padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">L-Rijopleidingen</p>
          <p style="margin:4px 0 0;color:#bdd4fb;font-size:13px;">Uw afspraak is bevestigd</p>
        </td></tr>

        <!-- Succes banner -->
        <tr><td style="background:#f0fdf4;padding:16px 32px;border-bottom:1px solid #bbf7d0;">
          <p style="margin:0;color:#16a34a;font-size:15px;font-weight:600;">✓ Afspraak ontvangen</p>
          <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Boekingsnummer: <strong style="color:#2c6bed;">${id}</strong></p>
        </td></tr>

        <!-- Details -->
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ["Naam",       naam],
              ["Datum",      formatDatum(datum)],
              ["Tijdsloten", slotsLabel],
              ["Diensten",   (dienstLabels || diensten || []).join(", ")],
              ...(optieLabels?.length || opties?.length ? [["Opties", (optieLabels || opties || []).join(", ")]] : []),
              ["Betaling",   betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
            ].map(([l, v]) => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${l}</td>
              <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;">${v}</td>
            </tr>`).join("")}
          </table>

          <!-- Totaal -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#eef3fd;border-radius:6px;">
            <tr><td style="padding:14px 16px;display:flex;justify-content:space-between;">
              <span style="font-size:14px;font-weight:600;color:#1a1f2e;">Te betalen op locatie</span>
            </td></tr>
            <tr><td style="padding:0 16px 14px;">
              <span style="font-size:24px;font-weight:700;color:#2c6bed;">€ ${(prijs?.totaal || prijs?.tot || 0).toFixed(2)}</span>
              ${kt === "consument" ? '<span style="font-size:11px;color:#9ca3af;margin-left:6px;">incl. btw</span>' : ""}
            </td></tr>
          </table>

          <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            Neem dit e-mailadres mee als bewijs van uw reservering. U betaalt <strong>${betaalMethode === "pin" ? "per pin" : "contant"}</strong> bij aanvang van de les.
          </p>
        </td></tr>

        <!-- Annuleren -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Wilt u deze afspraak annuleren?
            <a href="${cancelUrl}" style="color:#dc2626;text-decoration:underline;">Klik hier om te annuleren</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · Vragen? Neem contact op via info@l-rijopleidingen.nl</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [email],
        subject: `Afspraak bevestigd — ${formatDatum(datum)} · ${slotsLabel} (${id})`,
        html:    emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend fout:", err);
    }
  } catch (err) {
    console.error("Resend exception:", err);
  }

  // ── 3. Beheerdersmail ──────────────────────────────────────────────────────
  try {
    const adminEmail = env.ADMIN_EMAIL || (env.RESEND_FROM || "").trim();
    const ktLabels = { consument:"Cursist", zzp:"Instructeur", bedrijf:"Rijschoolhouder" };
    const adminHtml = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>Nieuwe boeking</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;">
        <tr><td style="background:#1a1f2e;padding:20px 32px;">
          <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">🔔 Nieuwe boeking ontvangen</p>
          <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">L-Rijopleidingen Boekingssysteem · ${new Date().toLocaleString("nl-NL")}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${[
              ["Boekingsnummer", id],
              ["Naam",           naam],
              ["Email",          email],
              ["Telefoon",       tel || "—"],
              ["Klanttype",      ktLabels[kt] || kt],
              ...(bedrijf ? [["Bedrijf", bedrijf]] : []),
              ["Datum",          formatDatum(datum)],
              ["Tijdsloten",     slotsLabel],
              ["Diensten",       (dienstLabels || diensten || []).join(", ")],
              ...(optieLabels?.length ? [["Opties", optieLabels.join(", ")]] : []),
              ["Betaling",       betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
              ["Totaal",         "€ " + (prijs?.totaal || prijs?.tot || 0).toFixed(2)],
            ].map(([l, v]) => `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:140px;">${l}</td>
              <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;font-weight:500;">${v}</td>
            </tr>`).join("")}
          </table>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen Boekingssysteem · Automatisch gegenereerd</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [adminEmail],
        subject: `🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}`,
        html:    adminHtml,
      }),
    });
  } catch (err) {
    console.error("Admin mail fout:", err.message);
  }

  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}