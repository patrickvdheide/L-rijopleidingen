// functions/api/boeking-opslaan.js

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

const BASE_URL  = "https://reserveren.l-rijopleidingen.nl";
const AT_BASE   = "https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2";
const RESEND    = "https://api.resend.com/emails";
const MAANDEN   = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

// Genereer boekingsnummer: YYYYMMDD-01, -02, etc.
async function genereerBoekingsnummer(datum, atToken) {
  // datum = "YYYY-MM-DD" → prefix = "20260323"
  const prefix = datum.replace(/-/g, "");

  // Haal alle boekingen van vandaag op (filter op Boekingsnummer begint met prefix)
  const formula = encodeURIComponent(`STARTS_WITH({Boekingsnummer}, "${prefix}")`);
  try {
    const res = await fetch(
      `${AT_BASE}?filterByFormula=${formula}&fields%5B%5D=Boekingsnummer&sort%5B0%5D%5Bfield%5D=Boekingsnummer&sort%5B0%5D%5Bdirection%5D=desc&pageSize=1`,
      { headers: { Authorization: `Bearer ${atToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const laatste = data.records?.[0]?.fields?.Boekingsnummer || "";
      // Extraheer het volgnummer: "20260323-03" → 3
      const match = laatste.match(/^\d{8}(\d+)$/);
      const volgend = match ? parseInt(match[1]) + 1 : 1;
      return `${prefix}${String(volgend).padStart(2, "0")}`;
    }
  } catch { /* val door naar fallback */ }

  // Fallback: datum + random 2 cijfers als Airtable niet bereikbaar is
  return `${prefix}${String(Math.floor(Math.random() * 90) + 10)}`;
}

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

async function stuurMail(resendKey, payload) {
  const res = await fetch(RESEND, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) console.error("Resend fout:", await res.text());
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let boeking;
  try { boeking = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const { kt, naam, email, tel, bedrijf, kvk, straat, huisnummer, postcode, plaats,
          diensten, dienstLabels, opties, optieLabels, datum, slots, betaalMethode, p: prijs } = boeking;

  // Genereer volgnummer server-side (negeert het id van de client)
  const id = await genereerBoekingsnummer(datum || new Date().toISOString().slice(0,10), env.AIRTABLE_TOKEN);

  const annuleerSecret = env.ANNULEER_SECRET || "lrijo-annuleer-2026";
  const cancelToken    = await maakHmac(id, annuleerSecret);
  const cancelUrl      = `${BASE_URL}/api/annuleer?id=${id}&token=${cancelToken}`;
  const icalParams  = new URLSearchParams({
    datum,
    start:   slots?.[0] || "09:00",
    eind:    (() => {
      const last = slots?.[slots.length-1] || "10:00";
      const [h,m] = last.split(":").map(Number);
      return String((h+1)%24).padStart(2,"0")+":"+String(m).padStart(2,"0");
    })(),
    id,
    naam:    naam    || "",
    email:   email   || "",
    dienst:  (dienstLabels || diensten || []).join(", "),
    opties:  (optieLabels  || opties   || []).join(", "),
    betaling: betaalMethode || "",
    totaal:  String(Number((prijs?.totaal || prijs?.tot || 0).toFixed(2))),
  });
  const icalUrl = `${BASE_URL}/api/ical?${icalParams.toString()}`;

  const slotsLabel  = slots?.length > 0 ? `${slots[0]}${slots.length > 1 ? ` – ${slots[slots.length - 1]}` : ""} (${slots.length}×)` : "—";
  const dienstenStr = (dienstLabels || diensten || []).join(", ");
  const optiesStr   = (optieLabels  || opties   || []).join(", ");
  const totaal      = Number((prijs?.totaal || prijs?.tot || 0).toFixed(2));
  const adresStr    = [straat, huisnummer, postcode, plaats].filter(Boolean).join(", ");
  const ktLabel     = { consument: "Cursist", zzp: "Instructeur", bedrijf: "Rijschoolhouder" }[kt] || kt;
  const vanaf       = "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">";

  // ── 1. Airtable opslaan (synchroon — response wacht hierop) ──
  const fields = {
    "Boekingsnummer": id,
    "Naam":           naam    || "",
    "Email":          email   || "",
    "Klanttype":      kt      || "",
    "Datum":          datum   || "",
    "Tijdsloten":     slotsLabel,
    "Diensten":       dienstenStr || "",
    "Betaalmethode":  betaalMethode === "pin" ? "pin" : "contant",
    "Totaal":         totaal,
    "Aangemaakt op":  new Date().toISOString(),
  };
  if (tel)        fields["Telefoon"]     = String(tel).trim();
  if (optiesStr)  fields["Opties"]       = optiesStr;
  if (bedrijf)    fields["Bedrijfsnaam"] = bedrijf;
  if (kvk)        fields["KVK"]          = kvk;
  if (adresStr)   fields["Adres"]        = adresStr;
  if (straat)     fields["Straat"]       = straat;
  if (postcode)   fields["Postcode"]     = postcode;
  if (plaats)     fields["Plaats"]       = plaats;
  if (huisnummer) fields["Huisnummer"]   = String(huisnummer);

  try {
    const atRes = await fetch(AT_BASE, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ fields }),
    });
    if (!atRes.ok) {
      const err = await atRes.text();
      return new Response(JSON.stringify({ error: "Airtable: " + atRes.status + " — " + err }), { status: 500, headers: CORS });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Airtable exception: " + err.message }), { status: 500, headers: CORS });
  }

  // ── 2 & 3. Mails asynchroon — blokkeren de response NIET ──
  const prijsStr = kt === "consument"
    ? `€ ${totaal.toFixed(2)} <small style="color:#9ca3af;font-size:11px;">incl. 21% btw</small>`
    : `€ ${totaal.toFixed(2)} <small style="color:#9ca3af;font-size:11px;">excl. btw</small>`;

  const tabelRijen = (rows) => rows.map(([l,v]) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;vertical-align:top;">${l}</td>
      <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;">${v}</td>
    </tr>`).join("");

  const klantRows = [
    ["Naam",       naam],
    ["Datum",      formatDatum(datum)],
    ["Tijdsloten", slotsLabel],
    ["Diensten",   dienstenStr],
    ...(optiesStr ? [["Opties", optiesStr]] : []),
    ["Betaling",   betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
  ];

  const klantHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;max-width:540px;">
  <tr><td style="background:#0586f0;padding:20px 32px;">
    <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:30px;display:block;margin-bottom:6px;"/>
    <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;">Uw afspraak is bevestigd</p>
  </td></tr>
  <tr><td style="background:#f0fdf4;padding:14px 32px;border-bottom:1px solid #bbf7d0;">
    <p style="margin:0;color:#16a34a;font-size:15px;font-weight:600;">✓ Afspraak ontvangen</p>
    <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Boekingsnummer: <strong style="color:#0586f0;">${id}</strong></p>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">${tabelRijen(klantRows)}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#eef3fd;border-radius:6px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#1a1f2e;">Te betalen op locatie</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#0586f0;">${prijsStr}</p>
      </td></tr>
    </table>
    <p style="margin:20px 0 8px;font-size:13px;color:#6b7280;line-height:1.6;">Neem dit e-mailadres mee als bewijs. U betaalt <strong>${betaalMethode === "pin" ? "per pin" : "contant"}</strong> bij aanvang.</p>
    <div style="margin-top:16px;text-align:center;">
      <a href="${icalUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">📅 Toevoegen aan agenda</a>
    </div>
  </td></tr>
  <tr><td style="padding:14px 32px;border-top:1px solid #f3f4f6;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">Wilt u annuleren? <a href="${cancelUrl}" style="color:#dc2626;">Klik hier</a></p>
  </td></tr>
  <tr><td style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
    <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:18px;display:block;margin-bottom:4px;"/>
    <p style="margin:0;font-size:12px;color:#9ca3af;">info@l-rijopleidingen.nl</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const adminRows = [
    ["Boekingsnummer", id], ["Naam", naam], ["Email", email],
    ...(tel     ? [["Telefoon", tel]]     : []),
    ["Klanttype",  ktLabel],
    ...(bedrijf ? [["Bedrijf",  bedrijf]] : []),
    ...(adresStr? [["Adres",    adresStr]]: []),
    ["Datum",      formatDatum(datum)],
    ["Tijdsloten", slotsLabel],
    ["Diensten",   dienstenStr],
    ...(optiesStr ? [["Opties", optiesStr]] : []),
    ["Betaling",   betaalMethode === "pin" ? "Pin op locatie" : "Contant op locatie"],
    ["Totaal",     `€ ${totaal.toFixed(2)} ${kt === "consument" ? "incl. btw" : "excl. btw"}`],
  ];

  const adminHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;max-width:540px;">
  <tr><td style="background:#1a1f2e;padding:20px 32px;">
    <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:26px;display:block;margin-bottom:8px;"/>
    <p style="margin:0;color:#fff;font-size:15px;font-weight:600;">🔔 Nieuwe boeking</p>
    <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">${new Date().toLocaleString("nl-NL")}</p>
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">${tabelRijen(adminRows)}</table>
  </td></tr>
  <tr><td style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
    <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:16px;display:block;margin-bottom:4px;"/>
    <p style="margin:0;font-size:11px;color:#9ca3af;">Boekingssysteem · Automatisch</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  // Beide mails asynchroon — response gaat direct terug naar frontend
  waitUntil(stuurMail(env.RESEND_KEY, {
    from:    vanaf,
    to:      [email],
    subject: `Afspraak bevestigd — ${formatDatum(datum)} · ${slotsLabel} (${id})`,
    html:    klantHtml,
  }));

  waitUntil(stuurMail(env.RESEND_KEY, {
    from:    vanaf,
    to:      [(env.RESEND_FROM || "").trim()],
    subject: `🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}`,
    html:    adminHtml,
  }));

  // ── Directe response — frontend hoeft niet op mails te wachten ──
  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}
