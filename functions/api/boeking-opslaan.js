// functions/api/boeking-opslaan.js

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

const BASE_URL = "https://reserveren.l-rijopleidingen.nl";

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

async function maakHmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let boeking;
  try {
    boeking = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const {
    id, kt, naam, email, tel,
    bedrijf, kvk,
    straat, huisnummer, postcode, plaats,
    diensten, dienstLabels,
    opties, optieLabels,
    datum, slots, betaalMethode, p: prijs,
    aantalOpts,
  } = boeking;

  const annuleerSecret = env.ANNULEER_SECRET || "fallback-niet-veilig";
  const cancelToken    = await maakHmac(id, annuleerSecret);
  const cancelUrl      = `${BASE_URL}/api/annuleer?id=${id}&token=${cancelToken}`;
  const icalUrl        = `${BASE_URL}/api/ical?id=${id}`;

  const slotsLabel = slots?.length > 0
    ? `${slots[0]}${slots.length > 1 ? ` – ${slots[slots.length - 1]}` : ""} (${slots.length}×)`
    : "—";

  const dienstenStr = (dienstLabels || diensten || []).join(", ");
  const optiesStr   = (optieLabels  || opties  || []).join(", ");
  const totaal      = Number((prijs?.totaal || prijs?.tot || 0).toFixed(2));
  const adresStr    = [straat, huisnummer, postcode, plaats].filter(Boolean).join(", ");

  // ── 1. Opslaan in Airtable ──
  // Bouw velden op — stuur alleen velden mee die een waarde hebben
  const fields = {
    "Boekingsnummer": id,
    "Naam":           naam          || "",
    "Email":          email         || "",
    "Klanttype":      kt            || "",
    "Datum":          datum         || "",
    "Tijdsloten":     slotsLabel,
    "Diensten":       dienstenStr   || "",
    "Betaalmethode":  betaalMethode === "pin" ? "pin" : "contant",
    "Totaal":         totaal,
    "Aangemaakt op":  new Date().toISOString(),
  };

  // Voeg optionele velden toe — alleen als ze een waarde hebben
  if (tel)     fields["Telefoon"]    = String(tel).trim();
  if (optiesStr) fields["Opties"]    = optiesStr;
  if (bedrijf) fields["Bedrijfsnaam"] = bedrijf;
  if (kvk)     fields["KVK"]        = kvk;
  if (adresStr) fields["Adres"]     = adresStr;
  if (straat)  fields["Straat"]     = straat;
  if (postcode) fields["Postcode"]  = postcode;
  if (plaats)  fields["Plaats"]     = plaats;
  // Huisnummer als string zodat "12A" ook werkt
  if (huisnummer) fields["Huisnummer"] = String(huisnummer);

  try {
    const atRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!atRes.ok) {
      const err = await atRes.text();
      return new Response(
        JSON.stringify({ error: "Airtable: " + atRes.status + " — " + err }),
        { status: 500, headers: CORS }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Airtable exception: " + err.message }),
      { status: 500, headers: CORS }
    );
  }

  // ── 2. Bevestigingsmail klant ──
  const prijsRegel = kt === "consument"
    ? `€ ${totaal.toFixed(2)} <span style="font-size:11px;color:#9ca3af;">incl. 21% btw</span>`
    : `€ ${totaal.toFixed(2)} <span style="font-size:11px;color:#9ca3af;">excl. btw</span>`;

  const klantHtml = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;max-width:540px;">
      <tr><td style="background:#0586f0;padding:20px 32px;">
        <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:30px;width:auto;display:block;margin-bottom:6px;"/>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;">Uw afspraak is bevestigd</p>
      </td></tr>
      <tr><td style="background:#f0fdf4;padding:16px 32px;border-bottom:1px solid #bbf7d0;">
        <p style="margin:0;color:#16a34a;font-size:15px;font-weight:600;">✓ Afspraak ontvangen</p>
        <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Boekingsnummer: <strong style="color:#0586f0;">${id}</strong></p>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${[
            ["Naam",       naam],
            ["Datum",      formatDatum(datum)],
            ["Tijdsloten", slotsLabel],
            ["Diensten",   dienstenStr],
            ...(optiesStr ? [["Opties", optiesStr]] : []),
            ["Betaling",   betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
          ].map(([l, v]) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${l}</td>
            <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;">${v}</td>
          </tr>`).join("")}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#eef3fd;border-radius:6px;">
          <tr><td style="padding:14px 16px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#1a1f2e;">Te betalen op locatie</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#0586f0;">${prijsRegel}</p>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
          Neem dit e-mailadres mee als bewijs. U betaalt <strong>${betaalMethode === "pin" ? "per pin" : "contant"}</strong> bij aanvang.
        </p>
        <div style="margin-top:20px;text-align:center;">
          <a href="${icalUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">📅 Voeg toe aan agenda</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Wilt u annuleren? <a href="${cancelUrl}" style="color:#dc2626;">Klik hier</a></p>
      </td></tr>
      <tr><td style="background:#f5f6f8;padding:14px 32px;border-top:1px solid #dde1e9;">
        <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:18px;display:block;margin-bottom:4px;"/>
        <p style="margin:0;font-size:12px;color:#9ca3af;">info@l-rijopleidingen.nl</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
        to:      [email],
        subject: `Afspraak bevestigd — ${formatDatum(datum)} · ${slotsLabel} (${id})`,
        html:    klantHtml,
      }),
    });
    if (!mailRes.ok) {
      const err = await mailRes.text();
      console.error("Resend klant fout:", err);
    }
  } catch (err) {
    console.error("Resend klant exception:", err.message);
  }

  // ── 3. Beheerdersmail ──
  const ktLabel = { consument: "Cursist", zzp: "Instructeur", bedrijf: "Rijschoolhouder" }[kt] || kt;
  const adminHtml = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;max-width:540px;">
      <tr><td style="background:#1a1f2e;padding:20px 32px;">
        <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;display:block;margin-bottom:8px;"/>
        <p style="margin:0;color:#fff;font-size:15px;font-weight:600;">🔔 Nieuwe boeking ontvangen</p>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">${new Date().toLocaleString("nl-NL")}</p>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${[
            ["Boekingsnummer", id],
            ["Naam",           naam],
            ["Email",          email],
            ...(tel           ? [["Telefoon", tel]]          : []),
            ["Klanttype",      ktLabel],
            ...(bedrijf       ? [["Bedrijf",  bedrijf]]      : []),
            ...(adresStr      ? [["Adres",    adresStr]]      : []),
            ["Datum",          formatDatum(datum)],
            ["Tijdsloten",     slotsLabel],
            ["Diensten",       dienstenStr],
            ...(optiesStr     ? [["Opties",   optiesStr]]     : []),
            ["Betaling",       betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
            ["Totaal",         "€ " + totaal.toFixed(2) + (kt === "consument" ? " incl. btw" : " excl. btw")],
          ].map(([l, v]) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:140px;">${l}</td>
            <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;font-weight:500;">${v}</td>
          </tr>`).join("")}
        </table>
      </td></tr>
      <tr><td style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
        <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:18px;display:block;margin-bottom:4px;"/>
        <p style="margin:0;font-size:12px;color:#9ca3af;">Boekingssysteem · Automatisch gegenereerd</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  try {
    const adminEmail = "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">";
    const adminRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    adminEmail,
        to:      [adminEmail],
        subject: `🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}`,
        html:    adminHtml,
      }),
    });
    if (!adminRes.ok) {
      const err = await adminRes.text();
      console.error("Resend admin fout:", err);
    }
  } catch (err) {
    console.error("Resend admin exception:", err.message);
  }

  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}
