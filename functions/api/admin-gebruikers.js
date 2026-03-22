// functions/api/admin-gebruikers.js

import { getAlleAdmins, maakAdmin, verwijderAdmin, updateAdmin, getAdmin } from "./_db.js";

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

async function verifieerSessie(db, url) {
  const token = url.searchParams.get("key");
  const user  = url.searchParams.get("user");
  if (!token || !user) return null;
  const admin = await getAdmin(db, user);
  if (!admin || !(admin.reset_token || "").startsWith("sessie_" + token) || new Date(admin.reset_verloopt) < new Date()) return null;
  return admin;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db  = env.DB;
  const url = new URL(request.url);

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  const admin = await verifieerSessie(db, url);
  if (!admin) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });

  // GET: lijst admins
  if (request.method === "GET") {
    const rijen = await getAlleAdmins(db);
    const gebruikers = rijen.map(r => ({
      id: String(r.id),
      fields: {
        Gebruikersnaam: r.gebruikersnaam,
        Email:          r.email,
        WachtwoordHash: r.wachtwoord_hash ? "***" : "",
      },
    }));
    return new Response(JSON.stringify({ gebruikers }), { status: 200, headers: CORS });
  }

  // POST: aanmaken, verwijderen, reset-mail
  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS }); }

  const { actie, gebruikersnaam, email, recordId } = body;

  if (actie === "aanmaken") {
    if (!gebruikersnaam || !email) return new Response(JSON.stringify({ error: "Gebruikersnaam en e-mail zijn verplicht" }), { status: 400, headers: CORS });
    try {
      await maakAdmin(db, gebruikersnaam, email);
    } catch (err) {
      return new Response(JSON.stringify({ error: "Gebruiker bestaat al of ander probleem: " + err.message }), { status: 409, headers: CORS });
    }
    const setupToken = randomToken(32);
    const verloopt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await updateAdmin(db, gebruikersnaam, { ResetToken: setupToken, ResetVerloopt: verloopt });
    const setupUrl = `https://reserveren.l-rijopleidingen.nl/admin.html?setup=1&user=${gebruikersnaam}&token=${setupToken}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
        to: [email],
        subject: "Welkom bij L-Rijopleidingen Beheer — Stel je wachtwoord in",
        html: `<p>Welkom ${gebruikersnaam}! Klik op de link om je wachtwoord in te stellen (7 dagen geldig):</p><a href="${setupUrl}">${setupUrl}</a>`,
      }),
    }).catch(() => {});
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  if (actie === "reset-mail") {
    const resetToken = randomToken(32);
    const verloopt   = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await updateAdmin(db, gebruikersnaam, { ResetToken: resetToken, ResetVerloopt: verloopt });
    const resetUrl = `https://reserveren.l-rijopleidingen.nl/admin.html?reset=${resetToken}&user=${gebruikersnaam}`;
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
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  if (actie === "verwijderen") {
    await verwijderAdmin(db, recordId);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Onbekende actie" }), { status: 400, headers: CORS });
}
