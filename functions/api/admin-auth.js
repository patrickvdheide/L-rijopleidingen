// functions/api/admin-auth.js

import { getAdmin, getAdminByEmail, updateAdmin } from "./_db.js";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

function randomToken(len = 32) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hashWachtwoord(ww) {
  const salt = randomToken(16);
  const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(ww), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return "pbkdf2:" + salt + ":" + Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function verifieerWachtwoord(ww, hash) {
  if (!hash) return false;
  if (!hash.startsWith("pbkdf2:")) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ww));
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
    return hex === hash;
  }
  const [, salt, stored] = hash.split(":");
  const key  = await crypto.subtle.importKey("raw", new TextEncoder().encode(ww), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  const hex  = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,"0")).join("");
  return hex === stored;
}

const loginPogingen = new Map();
function checkRateLimit(ip) {
  const nu = Date.now();
  const entry = loginPogingen.get(ip) || { count: 0, vanaf: nu };
  if (nu - entry.vanaf > 15 * 60 * 1000) { loginPogingen.set(ip, { count: 1, vanaf: nu }); return false; }
  if (entry.count >= 10) return true;
  loginPogingen.set(ip, { count: entry.count + 1, vanaf: entry.vanaf });
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (request.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const { actie, gebruikersnaam, wachtwoord, email, resetToken, token, nieuwWachtwoord } = body;
  const _resetToken = resetToken || token;

  // ── LOGIN ──
  if (actie === "login") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (checkRateLimit(ip)) return new Response(JSON.stringify({ error: "Te veel pogingen. Wacht 15 minuten." }), { status: 429, headers: CORS });

    const admin = await getAdmin(db, gebruikersnaam);
    if (!admin) return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });

    const geldig = await verifieerWachtwoord(wachtwoord, admin.wachtwoord_hash);
    if (!geldig) return new Response(JSON.stringify({ error: "Onjuiste gebruikersnaam of wachtwoord" }), { status: 401, headers: CORS });

    const sessieToken = randomToken(24);
    const verloopt    = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await updateAdmin(db, gebruikersnaam, { ResetToken: "sessie_" + sessieToken, ResetVerloopt: verloopt });

    return new Response(JSON.stringify({ success: true, token: sessieToken, gebruiker: gebruikersnaam }), { status: 200, headers: CORS });
  }

  // ── VERIFIEER SESSIE ──
  if (actie === "verifieer") {
    const { token: sessToken, gebruikersnaam: sessUser } = body;
    const admin = await getAdmin(db, sessUser);
    if (!admin) return new Response(JSON.stringify({ geldig: false }), { status: 200, headers: CORS });
    const opgeslagen = admin.reset_token || "";
    const verloopt   = admin.reset_verloopt;
    const geldig = opgeslagen.startsWith("sessie_" + sessToken) && new Date(verloopt) > new Date();
    return new Response(JSON.stringify({ geldig }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD VERGETEN ──
  if (actie === "vergeten") {
    const admin = await getAdminByEmail(db, email || "");
    if (admin) {
      const rt       = randomToken(32);
      const verloopt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await updateAdmin(db, admin.gebruikersnaam, { ResetToken: rt, ResetVerloopt: verloopt });
      const resetUrl = `https://reserveren.l-rijopleidingen.nl/admin.html?reset=${rt}&user=${admin.gebruikersnaam}`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
          to: [email],
          subject: "Wachtwoord reset — L-Rijopleidingen Beheer",
          html: `<p>Klik op de link om je wachtwoord opnieuw in te stellen (1 uur geldig):</p><a href="${resetUrl}">${resetUrl}</a>`,
        }),
      }).catch(() => {});
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── WACHTWOORD RESET ──
  if (actie === "reset") {
    const admin = await getAdmin(db, gebruikersnaam);
    const token_ok = admin?.reset_token === _resetToken && !(admin?.reset_token || "").startsWith("sessie_");
    if (!admin || !token_ok) return new Response(JSON.stringify({ error: "Ongeldige of verlopen resetlink" }), { status: 401, headers: CORS });
    if (new Date(admin.reset_verloopt) < new Date()) return new Response(JSON.stringify({ error: "Deze resetlink is verlopen. Vraag een nieuwe aan." }), { status: 401, headers: CORS });
    const hash = await hashWachtwoord(nieuwWachtwoord);
    await updateAdmin(db, gebruikersnaam, { WachtwoordHash: hash, ResetToken: "", ResetVerloopt: "" });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  // ── SETUP (eerste wachtwoord) ──
  if (actie === "setup") {
    const admin = await getAdmin(db, gebruikersnaam);
    if (!admin) return new Response(JSON.stringify({ error: "Gebruiker niet gevonden" }), { status: 404, headers: CORS });
    if (admin.wachtwoord_hash) return new Response(JSON.stringify({ error: "Wachtwoord al ingesteld. Gebruik de resetlink." }), { status: 400, headers: CORS });
    const hash = await hashWachtwoord(nieuwWachtwoord);
    await updateAdmin(db, gebruikersnaam, { WachtwoordHash: hash });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
