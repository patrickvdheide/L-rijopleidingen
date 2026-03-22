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
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

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
  const fields = {
    "Boekingsnummer": id,
    "Naam":           naam || "",
    "Email":          email || "",
    "Klanttype":      kt || "",
    "Datum":          datum || "",
    "Tijdsloten":     slotsLabel,
    "Diensten":       dienstenStr || "",
    "Betaalmethode":  betaalMethode === "pin" ? "pin" : "contant",
    "Totaal":         totaal,
    "Aangemaakt op":  new Date().toISOString(),
  };
  if (tel)       fields["Telefoon"]    = String(tel).trim();
  if (optiesStr) fields["Opties"]      = optiesStr;
  if (bedrijf)   fields["Bedrijfsnaam"]= bedrijf;
  if (kvk)       fields["KVK"]         = kvk;
  if (adresStr)  fields["Adres"]       = adresStr;
  if (straat)    fields["Straat"]      = straat;
  if (postcode)  fields["Postcode"]    = postcode;
  if (plaats)    fields["Plaats"]      = plaats;
  if (huisnummer)fields["Huisnummer"]  = String(huisnummer);

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
      return new Response(JSON.stringify({ error: "Airtable: " + atRes.status + " — " + err }), { status: 500, headers: CORS });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Airtable exception: " + err.message }), { status: 500, headers: CORS });
  }

  // ── 2. Bevestigingsmail klant (async) ──
  const prijsRegel = kt === "consument"
    ? `€ ${totaal.toFixed(2)} <span style="font-size:11px;color:#9ca3af;">incl. 21% btw</span>`
    : `€ ${totaal.toFixed(2)} <span style="font-size:11px;color:#9ca3af;">excl. btw</span>`;

  const klantHtml = `...`; // je bestaande HTML-template (ongewijzigd)

  waitUntil((async () => {
    try {
      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          from: `L-Rijopleidingen <${(env.RESEND_FROM || "").trim()}>`,
          to: [email],
          subject: `Afspraak bevestigd — ${formatDatum(datum)} · ${slotsLabel} (${id})`,
          html: klantHtml,
        }),
      });
      if (!mailRes.ok) {
        const err = await mailRes.text();
        console.error("Resend klant fout:", err);
      }
    } catch (err) {
      console.error("Resend klant exception:", err.message);
    }
  })());

  // ── 3. Beheerdersmail (async) ──
  const ktLabel = { consument: "Cursist", zzp: "Instructeur", bedrijf: "Rijschoolhouder" }[kt] || kt;
  const adminHtml = `...`; // je bestaande admin HTML-template (ongewijzigd)

  waitUntil((async () => {
    try {
      const adminEmail = `L-Rijopleidingen <${(env.RESEND_FROM || "").trim()}>`;
      const adminRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          from: adminEmail,
          to: [adminEmail],
          subject: `🔔 Nieuwe boeking: ${naam} — ${formatDatum(datum)} ${slotsLabel}`,
          html: adminHtml,
        }),
      });
      if (!adminRes.ok) {
        const err = await adminRes.text();
        console.error("Resend admin fout:", err);
      }
    } catch (err) {
      console.error("Resend admin exception:", err.message);
    }
  })());

  // ── 4. Response direct terug naar frontend ──
  return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: CORS });
}
