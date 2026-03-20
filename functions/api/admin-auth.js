// functions/api/admin-auth.js

const BASE   = "appchbjgwoZQiQjfv";
const TABEL  = "tblxPXaRSgAHiiauP";
const AT_URL = `https://api.airtable.com/v0/${BASE}/${TABEL}`;

const ALLOWED_ORIGINS = [
  "https://boekingen.l-rijopleidingen.nl",
  "https://l-rijopleidingen.pages.dev",
];

function corsHeaders(req) {
  const origin = req?.headers?.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type":                 "application/json",
    "Vary":                         "Origin",
  };
}

// ── Wachtwoord hashing: PBKDF2 met salt (veilig voor opslag) ──
async function hashWachtwoord(wachtwoord) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifieerWachtwoord(wachtwoord, opgeslagen) {
  if (!opgeslagen) return false;
  // Nieuw formaat: pbkdf2:salt:hash
  if (opgeslagen.startsWith("pbkdf2:")) {
    const delen = opgeslagen.split(":");
    if (delen.length !== 3) return false;
    const [, saltHex, hashHex] = delen;
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256
    );
    const hashHex2 = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex === hashHex2;
  }
  // Legacy SHA-256 fallback (voor bestaande accounts)
  const data = new TextEncoder().encode(wachtwoord);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  const legacyHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return legacyHash === opgeslagen;
}

function randomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Sanitize input voor Airtable formules
function sanitize(str) {
  return (str || "").replace(/["\\]/g, "");
}

async function zoekAdmin(veld, waarde, token) {
  const formule = encodeURIComponent(`{${veld}}="${sanitize(waarde)}"`);
  const res = await fetch(`${AT_URL}?filterByFormula=${formule}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Airtable: " + res.status);
  const data = await res.json();
  return data.records?.[0] || null;
}

async function updateAdmin(recordId, velden, token) {
  const res = await fetch(`${AT_URL}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: velden })
  });
  if (!res.ok) throw new Error("Airtable update: " + res.status);
  return res.json();
}

// ── Eenvoudige rate limiter (per worker instance, reset bij cold start) ──
const loginPogingen = new Map();
function checkRateLimit(ip) {
  const nu = Date.now();
  const entry = loginPogingen.get(ip) || { count: 0, vanaf: nu };
  if (nu - entry.vanaf > 15 * 60 * 1000) {
    loginPogingen.set(ip, { count: 1, vanaf: nu });
    return false;
  }
  if (entry.count >= 10) return true; // geblokkeerd
  entry.count++;
  loginPogingen.set(ip, entry);
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = corsHeaders(request);

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
    const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
    if (checkRateLimit(ip)) {
      return new Response(JSON.stringify({ error: "Te veel pogingen. Wacht 15 minuten." }), { status: 429, headers: CORS });
    }

    const { gebruikersnaam, wachtwoord } = body;
    if (!gebruikersnaam || !wachtwoord) {
      return new Response(JSON.stringify({ error: "Vul gebruikersnaam en wachtwoord in" }), { status: 400, headers: CORS });
    }

    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    // Altijd zelfde foutmelding (voorkomt gebruikers-enumeratie)
    if (!admin) {
      return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });
    }
    if (!admin.fields.WachtwoordHash) {
      return new Response(JSON.stringify({ error: "Geen wachtwoord ingesteld. Gebruik de setup-link die je per mail ontvangen hebt." }), { status: 401, headers: CORS });
    }

    const geldig = await verifieerWachtwoord(wachtwoord, admin.fields.WachtwoordHash);
    if (!geldig) {
      return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });
    }

    // Upgrade legacy SHA-256 hash naar PBKDF2 bij succesvolle login
    if (!admin.fields.WachtwoordHash.startsWith("pbkdf2:")) {
      const nieuweHash = await hashWachtwoord(wachtwoord);
      await updateAdmin(admin.id, { WachtwoordHash: nieuweHash }, atToken).catch(() => {});
    }

    const sessieToken = randomToken(24);
    const verloopt    = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await updateAdmin(admin.id, { ResetToken: "sessie_" + sessieToken, ResetVerloopt: verloopt }, atToken);

    return new Response(JSON.stringify({
      success:   true,
      token:     sessieToken,
      gebruiker: gebruikersnaam,
    }), { status: 200, headers: CORS });
  }

  // ── VERIFIEER SESSIE ──
  if (actie === "verifieer") {
    const { token, gebruikersnaam } = body;
    if (!token || !gebruikersnaam) return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });
    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin) return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });
    const opgeslagen = admin.fields.ResetToken || "";
    const verloopt   = admin.fields.ResetVerloopt;
    if (!opgeslagen.startsWith("sessie_" + token) || new Date(verloopt) < new Date()) {
      return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });
    }
    return new Response(JSON.stringify({ geldig: true }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD VERGETEN ──
  if (actie === "vergeten") {
    const { email } = body;
    const admin = await zoekAdmin("Email", email, atToken);
    if (!admin) {
      // Altijd succes teruggeven (geen email-enumeratie)
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
    }

    const resetToken = randomToken(20);
    const verloopt   = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateAdmin(admin.id, { ResetToken: resetToken, ResetVerloopt: verloopt }, atToken);

    const resetUrl = `https://boekingen.l-rijopleidingen.nl/admin.html?reset=${resetToken}&user=${encodeURIComponent(admin.fields.Gebruikersnaam)}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [email],
        subject: "Wachtwoord reset — L-Rijopleidingen Beheer",
        html:    `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;">
        <tr><td style="background:#0586f0;padding:20px 32px;border-radius:8px 8px 0 0">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">L-Rijopleidingen — Beheer</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="font-size:18px;color:#1a1f2e;margin:0 0 12px">Wachtwoord resetten</h2>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px">Klik op de knop hieronder om een nieuw wachtwoord in te stellen. De link is 1 uur geldig.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Nieuw wachtwoord instellen</a>
          <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">Als je geen reset hebt aangevraagd kun je deze mail negeren.</p>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD RESETTEN ──
  if (actie === "reset") {
    const { resetToken, gebruikersnaam, nieuwWachtwoord } = body;
    if (!nieuwWachtwoord || nieuwWachtwoord.length < 10) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minimaal 10 tekens zijn" }), { status: 400, headers: CORS });
    }
    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin || admin.fields.ResetToken !== resetToken || admin.fields.ResetToken?.startsWith("sessie_")) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen resetlink" }), { status: 401, headers: CORS });
    }
    if (new Date(admin.fields.ResetVerloopt) < new Date()) {
      return new Response(JSON.stringify({ error: "Deze resetlink is verlopen. Vraag een nieuwe aan." }), { status: 401, headers: CORS });
    }
    const hash = await hashWachtwoord(nieuwWachtwoord);
    await updateAdmin(admin.id, { WachtwoordHash: hash, ResetToken: "", ResetVerloopt: "" }, atToken);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── SETUP: eerste wachtwoord via token uit welkomstmail ──
  if (actie === "setup") {
    const { gebruikersnaam, nieuwWachtwoord, resetToken } = body;
    if (!nieuwWachtwoord || nieuwWachtwoord.length < 10) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minimaal 10 tekens zijn" }), { status: 400, headers: CORS });
    }
    if (!resetToken) {
      return new Response(JSON.stringify({ error: "Ongeldige setup-link" }), { status: 401, headers: CORS });
    }
    const admin = await zoekAdmin("Gebruikersnaam", gebruikersnaam, atToken);
    if (!admin || admin.fields.ResetToken !== resetToken) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen setup-link" }), { status: 401, headers: CORS });
    }
    if (new Date(admin.fields.ResetVerloopt) < new Date()) {
      return new Response(JSON.stringify({ error: "Setup-link is verlopen. Vraag een nieuwe aan bij de beheerder." }), { status: 401, headers: CORS });
    }
    if (admin.fields.WachtwoordHash) {
      return new Response(JSON.stringify({ error: "Er is al een wachtwoord ingesteld. Gebruik wachtwoord vergeten." }), { status: 400, headers: CORS });
    }
    const hash = await hashWachtwoord(nieuwWachtwoord);
    await updateAdmin(admin.id, { WachtwoordHash: hash, ResetToken: "", ResetVerloopt: "" }, atToken);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
