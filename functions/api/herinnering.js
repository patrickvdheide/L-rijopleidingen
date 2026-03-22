// functions/api/herinnering.js
// Dagelijkse herinneringsmails — aanroepen via cron (cron-job.org)

import { getAlleBoekingen, updateBoeking } from "./_db.js";

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== (env.CRON_SECRET || "")) {
    return new Response("Niet geautoriseerd", { status: 401 });
  }

  const db = env.DB;
  const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { results } = await db.prepare(
    "SELECT * FROM boekingen WHERE datum = ? AND status = 'Actief' AND herinnerd = 0"
  ).bind(morgen).all();

  if (!results.length) return new Response(JSON.stringify({ verstuurd: 0 }), { status: 200 });

  let verstuurd = 0;
  const logo = `<img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;"/>`;

  for (const bk of results) {
    const icalParams = new URLSearchParams({
      datum: bk.datum, id: bk.boekingsnummer,
      start: (bk.tijdsloten || "09:00").match(/(\d{2}:\d{2})/)?.[1] || "09:00",
      eind:  (() => {
        const m = (bk.tijdsloten || "").match(/[–-]\s*(\d{2}:\d{2})/);
        if (m) return m[1];
        const s = (bk.tijdsloten || "09:00").match(/(\d{2}:\d{2})/)?.[1] || "09:00";
        const [h] = s.split(":").map(Number);
        return String(h+1).padStart(2,"0") + ":00";
      })(),
      naam: bk.naam || "", email: bk.email || "",
      dienst: bk.diensten || "", opties: bk.opties || "",
      betaling: bk.betaalmethode || "", totaal: String(bk.totaal || 0),
    });
    const icalUrl = `https://reserveren.l-rijopleidingen.nl/api/ical?${icalParams}`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#0586f0;padding:20px 32px;">${logo}</td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#1a1f2e;">📅 Herinnering: afspraak morgen</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">Beste ${bk.naam}, morgen heeft u een afspraak bij L-Rijopleidingen.</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Datum</td><td style="font-size:13px;color:#1a1f2e;">${formatDatum(bk.datum)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Tijdsloten</td><td style="font-size:13px;color:#1a1f2e;">${bk.tijdsloten}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Dienst</td><td style="font-size:13px;color:#1a1f2e;">${bk.diensten}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Betaling</td><td style="font-size:13px;color:#1a1f2e;">${bk.betaalmethode === "pin" ? "Pin op locatie" : "Contant op locatie"} · € ${Number(bk.totaal).toFixed(2)}</td></tr>
    </table>
    <a href="${icalUrl}" style="display:inline-block;margin-top:20px;background:#0586f0;color:white;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">📅 Toevoegen aan agenda</a>
  </td></tr>
</table></td></tr></table></body></html>`;

    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "L-Rijopleidingen <" + (env.RESEND_FROM || "").trim() + ">",
        to: [bk.email],
        subject: `Herinnering: afspraak morgen ${formatDatum(bk.datum)} · ${bk.tijdsloten}`,
        html,
      }),
    }).catch(() => null);

    if (mailRes?.ok) {
      await updateBoeking(db, bk.boekingsnummer, { herinnerd: 1 });
      verstuurd++;
    }
  }

  return new Response(JSON.stringify({ verstuurd, morgen }), { status: 200 });
}
