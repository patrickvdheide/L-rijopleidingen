// admin-gebruikers.js — v7
// admin-gebruikers.js — v7.0.0
// functions/api/admin-gebruikers.js
// Beheer van admin gebruikers — aanmaken, verwijderen, reset mail

const AT_BASE    = "appchbjgwoZQiQjfv";
const AT_BOEK    = "tblxPXaRSgAHiiauP"; // Admins tabel
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type":                 "application/json",
};

function randomToken(len=20) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  // ── Sessie verificatie ──
  const _url   = new URL(request.url);
  const _token = _url.searchParams.get("key");
  const _user  = _url.searchParams.get("user");
  if (!_token || !_user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const _ar = await fetch(
    `https://api.airtable.com/v0/${AT_BASE}/${AT_BOEK}?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="'+_user+'"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(()=>null);
  if (!_ar?.ok) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _ad = await _ar.json();
  const _rec = _ad.records?.[0];
  if (!_rec || !(_rec.fields?.ResetToken||"").startsWith("sessie_"+_token) || new Date(_rec.fields?.ResetVerloopt||0) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }
  // ── Einde verificatie ──

  const atUrl = `https://api.airtable.com/v0/${AT_BASE}/${AT_BOEK}`;
  const atHeaders = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };

  // ── GET: alle gebruikers ophalen ──
  if (request.method === "GET") {
    const res = await fetch(atUrl, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!res.ok) return new Response(JSON.stringify({ error: "Airtable: "+res.status }), { status: 500, headers: CORS });
    const data = await res.json();
    // Verberg wachtwoord hash in response
    const gebruikers = (data.records||[]).map(r => ({
      id: r.id,
      fields: {
        Gebruikersnaam: r.fields?.Gebruikersnaam,
        Email:          r.fields?.Email,
        WachtwoordHash: r.fields?.WachtwoordHash ? "***" : "",
      }
    }));
    return new Response(JSON.stringify({ gebruikers }), { status: 200, headers: CORS });
  }

  // ── POST: acties ──
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { actie } = body;

  // ── Gebruiker aanmaken ──
  if (actie === "aanmaken") {
    const { gebruikersnaam, email } = body;
    if (!gebruikersnaam || !email) {
      return new Response(JSON.stringify({ error: "Gebruikersnaam en e-mail zijn verplicht" }), { status: 400, headers: CORS });
    }

    // Controleer of gebruikersnaam al bestaat
    const checkRes = await fetch(
      `${atUrl}?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="'+gebruikersnaam+'"')}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    const checkData = await checkRes.json();
    if (checkData.records?.length > 0) {
      return new Response(JSON.stringify({ error: "Gebruikersnaam '"+gebruikersnaam+"' bestaat al" }), { status: 400, headers: CORS });
    }

    // Aanmaken in Airtable
    const maakRes = await fetch(atUrl, {
      method: "POST",
      headers: atHeaders,
      body: JSON.stringify({ fields: { Gebruikersnaam: gebruikersnaam, Email: email } })
    });
    if (!maakRes.ok) {
      const err = await maakRes.text();
      return new Response(JSON.stringify({ error: "Aanmaken mislukt: "+err }), { status: 500, headers: CORS });
    }
    const nieuw = await maakRes.json();

    // Stuur setup mail
    const setupToken = randomToken(20);
    const verloopt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dagen
    await fetch(`${atUrl}/${nieuw.id}`, {
      method: "PATCH", headers: atHeaders,
      body: JSON.stringify({ fields: { ResetToken: setupToken, ResetVerloopt: verloopt } })
    });

    const setupUrl = `https://boekingen.l-rijopleidingen.nl/admin.html?setup=1&user=${gebruikersnaam}&token=${setupToken}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM||"").trim(),
        to:      [email],
        subject: "Welkom bij L-Rijopleidingen Beheer — Stel je wachtwoord in",
        html:    `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;">
        <tr><td style="background:#1a1f2e;padding:20px 32px;border-radius:8px 8px 0 0">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">L-Rijopleidingen &mdash; Beheer</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="font-size:18px;font-weight:700;color:#1a1f2e;margin:0 0 12px">Welkom, ${gebruikersnaam}!</h2>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px">Er is een beheerdersaccount voor je aangemaakt. Klik op de knop hieronder om een wachtwoord in te stellen en in te loggen.</p>
          <a href="${setupUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Wachtwoord instellen</a>
          <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">Deze link is 7 dagen geldig.</p>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen &middot; info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── Reset mail sturen ──
  if (actie === "reset-mail") {
    const { recordId, email, gebruikersnaam } = body;
    const resetToken = randomToken(20);
    const verloopt   = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 uur

    await fetch(`${atUrl}/${recordId}`, {
      method: "PATCH", headers: atHeaders,
      body: JSON.stringify({ fields: { ResetToken: resetToken, ResetVerloopt: verloopt } })
    });

    const resetUrl = `https://boekingen.l-rijopleidingen.nl/admin.html?reset=${resetToken}&user=${gebruikersnaam}`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM||"").trim(),
        to:      [email],
        subject: "Wachtwoord reset — L-Rijopleidingen Beheer",
        html:    `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;">
        <tr><td style="background:#1a1f2e;padding:20px 32px;border-radius:8px 8px 0 0">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">L-Rijopleidingen &mdash; Beheer</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <h2 style="font-size:18px;font-weight:700;color:#1a1f2e;margin:0 0 12px">Wachtwoord resetten</h2>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 20px">Klik op de knop hieronder om een nieuw wachtwoord in te stellen voor je account.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Nieuw wachtwoord instellen</a>
          <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">Deze link is 1 uur geldig.</p>
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen &middot; info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── Gebruiker verwijderen ──
  if (actie === "verwijderen") {
    const { recordId } = body;
    const res = await fetch(`${atUrl}/${recordId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
    });
    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: "Verwijderen mislukt: "+err }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
