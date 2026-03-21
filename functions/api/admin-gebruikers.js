// functions/api/admin-gebruikers.js

const BASE    = "appchbjgwoZQiQjfv";
const AT_BASE = `https://api.airtable.com/v0/${BASE}`;
const TABEL   = "tblxPXaRSgAHiiauP";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type":                 "application/json",
};

function randomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context) {
  const { request, env } = context;
  // CORS already defined above

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  // ── Sessie verificatie ──
  const _url   = new URL(request.url);
  const _token = _url.searchParams.get("key");
  const _user  = _url.searchParams.get("user");
  if (!_token || !_user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const _ar = await fetch(
    `${AT_BASE}/${TABEL}?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="' + _user.replace(/["\\]/g,"") + '"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(() => null);
  if (!_ar?.ok) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const _ad  = await _ar.json();
  const _rec = _ad.records?.[0];
  if (!_rec || !(_rec.fields?.ResetToken || "").startsWith("sessie_" + _token) || new Date(_rec.fields?.ResetVerloopt || 0) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }
  // ── Einde verificatie ──

  const atAuth = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` };

  // GET — lijst gebruikers
  if (request.method === "GET") {
    const res = await fetch(`${AT_BASE}/${TABEL}`, { headers: atAuth });
    if (!res.ok) return new Response(JSON.stringify({ error: "Airtable fout" }), { status: 500, headers: CORS });
    const data = await res.json();
    const gebruikers = (data.records || []).map(r => ({
      id: r.id,
      fields: {
        Gebruikersnaam: r.fields.Gebruikersnaam,
        Email:          r.fields.Email,
        WachtwoordHash: r.fields.WachtwoordHash ? "***" : "",
      }
    }));
    return new Response(JSON.stringify({ gebruikers }), { status: 200, headers: CORS });
  }

  // POST — beheeracties
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { actie } = body;

  if (actie === "aanmaken") {
    const { gebruikersnaam, email } = body;
    if (!gebruikersnaam || !email) {
      return new Response(JSON.stringify({ error: "Vul alle velden in" }), { status: 400, headers: CORS });
    }
    const setupToken = randomToken(32);
    const verloopt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const aanmaken = await fetch(`${AT_BASE}/${TABEL}`, {
      method: "POST",
      headers: { ...atAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { Gebruikersnaam: gebruikersnaam, Email: email, ResetToken: setupToken, ResetVerloopt: verloopt } })
    });
    if (!aanmaken.ok) {
      return new Response(JSON.stringify({ error: "Aanmaken mislukt" }), { status: 500, headers: CORS });
    }
    const setupUrl = `https://reserveren.l-rijopleidingen.nl/admin.html?setup=1&user=${gebruikersnaam}&token=${setupToken}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [email],
        subject: "Welkom bij L-Rijopleidingen Beheer",
        html:    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f6f8;padding:32px;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #dde1e9;overflow:hidden;"><div style="background:#0586f0;padding:20px 32px;"><img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;display:block;"/></div><div style="padding:28px 32px;"><h2 style="color:#1a1f2e;margin:0 0 12px">Account aangemaakt</h2><p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px">Gebruikersnaam: <strong>${gebruikersnaam}</strong><br>Klik op de knop om een wachtwoord in te stellen. De link is 7 dagen geldig.</p><a href="${setupUrl}" style="display:inline-block;background:#0586f0;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Wachtwoord instellen</a></div></div></body></html>`
      })
    });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  if (actie === "reset-mail") {
    const { recordId, email, gebruikersnaam } = body;
    const resetToken = randomToken(32);
    const verloopt   = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await fetch(`${AT_BASE}/${TABEL}/${recordId}`, {
      method: "PATCH",
      headers: { ...atAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { ResetToken: resetToken, ResetVerloopt: verloopt } })
    });
    const resetUrl = `https://reserveren.l-rijopleidingen.nl/admin.html?reset=${resetToken}&user=${gebruikersnaam}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    (env.RESEND_FROM || "").trim(),
        to:      [email],
        subject: "Wachtwoord reset — L-Rijopleidingen Beheer",
        html:    `<p>Klik op de link om je wachtwoord opnieuw in te stellen (1 uur geldig):</p><a href="${resetUrl}">${resetUrl}</a>`
      })
    });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  if (actie === "verwijderen") {
    const { recordId } = body;
    const res = await fetch(`${AT_BASE}/${TABEL}/${recordId}`, { method: "DELETE", headers: atAuth });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Verwijderen mislukt" }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
