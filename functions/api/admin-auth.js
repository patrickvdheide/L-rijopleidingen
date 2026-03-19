// functions/api/admin-auth.js
// Verwerkt login, wachtwoord vergeten en wachtwoord reset

const BASE    = "appchbjgwoZQiQjfv";
const TABEL   = "tblxPXaRSgAHiiauP";
const AT_URL  = `https://api.airtable.com/v0/${BASE}/${TABEL}`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

// SHA-256 hash via Web Crypto (beschikbaar in Cloudflare Workers)
async function sha256(tekst) {
  const data    = new TextEncoder().encode(tekst);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// Willekeurig token genereren
function randomToken(len=32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// Zoek admin op in Airtable
async function zoekAdmin(veld, waarde, token) {
  const formule = encodeURIComponent(`{${veld}}="${waarde}"`);
  const res = await fetch(`${AT_URL}?filterByFormula=${formule}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Airtable: " + res.status);
  const data = await res.json();
  return data.records?.[0] || null;
}

// Update admin record
async function updateAdmin(recordId, velden, token) {
  const res = await fetch(`${AT_URL}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: velden })
  });
  if (!res.ok) throw new Error("Airtable update: " + res.status);
  return res.json();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { actie } = body;
  const atToken = env.AIRTABLE_TOKEN;

  // ── LOGIN ──
  if (actie === "login") {
    const { gebruikersnaam, wachtwoord } = body;
    if (!gebruikersnaam || !wachtwoord) {
      return new Response(JSON.stringify({ error: "Vul gebruikersnaam en wachtwoord in" }), { status: 400, headers: CORS });
    }

    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });
    }

    const hash = await sha256(wachtwoord);

    // Eerste keer inloggen — nog geen wachtwoord ingesteld
    if (!admin.fields.WachtwoordHash) {
      return new Response(JSON.stringify({ error: "Geen wachtwoord ingesteld. Gebruik de setup-link die je per mail ontvangen hebt." }), { status: 401, headers: CORS });
    }

    if (hash !== admin.fields.WachtwoordHash) {
      return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });
    }

    // Genereer sessie token
    const sessieToken = randomToken(24);
    const verloopt    = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 uur

    await updateAdmin(admin.id, { ResetToken: "sessie_"+sessieToken, ResetVerloopt: verloopt }, atToken);

    return new Response(JSON.stringify({
      success:    true,
      token:      sessieToken,
      gebruiker:  gebruikersnaam,
      email:      admin.fields.Email,
    }), { status: 200, headers: CORS });
  }

  // ── VERIFIEER SESSIE ──
  if (actie === "verifieer") {
    const { token, gebruikersnaam } = body;
    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin) return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });

    const opgeslagen = admin.fields.ResetToken;
    const verloopt   = admin.fields.ResetVerloopt;

    if (!opgeslagen || !opgeslagen.startsWith("sessie_"+token)) {
      return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });
    }
    if (new Date(verloopt) < new Date()) {
      return new Response(JSON.stringify({ geldig: false, verlopen: true }), { status: 200, headers: CORS });
    }
    return new Response(JSON.stringify({ geldig: true }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD VERGETEN ──
  if (actie === "vergeten") {
    const { email } = body;
    const admin = await zoekAdmin("Email", email, atToken);

    // Altijd dezelfde response (geen gebruikersenumeration)
    if (!admin) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
    }

    const resetToken  = randomToken(20);
    const verloopt    = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 uur
    await updateAdmin(admin.id, { ResetToken: resetToken, ResetVerloopt: verloopt }, atToken);

    const resetUrl = `https://boekingen.l-rijopleidingen.nl/admin.html?reset=${resetToken}&user=${admin.fields.Gebruikersnaam}`;

    // Stuur reset mail
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [email],
        subject: "Wachtwoord reset — L-Rijopleidingen Beheer",
        html:    `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;overflow:hidden;">
        <tr><td style="background:#1a1f2e;padding:20px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">L-Rijopleidingen &mdash; Beheer</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="font-size:18px;font-weight:700;color:#1a1f2e;margin:0 0 12px">Wachtwoord resetten</h2>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px">Je hebt een wachtwoord reset aangevraagd voor je beheerdersaccount. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Nieuw wachtwoord instellen</a>
          <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">Deze link is 1 uur geldig. Als je geen reset hebt aangevraagd kun je deze mail negeren.</p>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen &middot; info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD RESETTEN ──
  if (actie === "reset") {
    const { resetToken, gebruikersnaam, nieuwWachtwoord } = body;

    if (!nieuwWachtwoord || nieuwWachtwoord.length < 8) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minimaal 8 tekens zijn" }), { status: 400, headers: CORS });
    }

    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin || admin.fields.ResetToken !== resetToken) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen resetlink" }), { status: 401, headers: CORS });
    }
    if (new Date(admin.fields.ResetVerloopt) < new Date()) {
      return new Response(JSON.stringify({ error: "Deze resetlink is verlopen. Vraag een nieuwe aan." }), { status: 401, headers: CORS });
    }

    const hash = await sha256(nieuwWachtwoord);
    await updateAdmin(admin.id, { WachtwoordHash: hash, ResetToken: "", ResetVerloopt: "" }, atToken);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── SETUP (eerste wachtwoord instellen) ──
  if (actie === "setup") {
    const { gebruikersnaam, nieuwWachtwoord } = body;

    if (!nieuwWachtwoord || nieuwWachtwoord.length < 8) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minimaal 8 tekens zijn" }), { status: 400, headers: CORS });
    }

    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Gebruiker niet gevonden" }), { status: 404, headers: CORS });
    }
    if (admin.fields.WachtwoordHash) {
      return new Response(JSON.stringify({ error: "Er is al een wachtwoord ingesteld. Gebruik wachtwoord vergeten." }), { status: 400, headers: CORS });
    }

    const hash = await sha256(nieuwWachtwoord);
    await updateAdmin(admin.id, { WachtwoordHash: hash }, atToken);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
