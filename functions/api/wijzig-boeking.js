// functions/api/wijzig-boeking.js

const ALLOWED_ORIGINS = ["https://boekingen.l-rijopleidingen.nl","https://l-rijopleidingen.pages.dev"];
function corsHeaders(req) {
  const origin = req?.headers?.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-User", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" };
}

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = corsHeaders(request);

  if (request.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  // ── Sessie verificatie ──
  const _authHeader = request.headers.get("Authorization") || "";
  const _token = _authHeader.startsWith("Bearer ") ? _authHeader.slice(7).trim() : "";
  const _user  = (request.headers.get("X-Admin-User") || "").trim();
  if (!_token || !_user) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _safeUser = _user.replace(/["\\]/g, "");
  const _ar = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tblxPXaRSgAHiiauP?filterByFormula=${encodeURIComponent('{Gebruikersnaam}="' + _safeUser + '"')}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  ).catch(() => null);
  if (!_ar?.ok) return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  const _ad = await _ar.json();
  const _rec = _ad.records?.[0];
  if (!_rec || !(_rec.fields?.ResetToken || "").startsWith("sessie_" + _token) || new Date(_rec.fields?.ResetVerloopt || 0) < new Date()) {
    return new Response(JSON.stringify({ error: "Sessie verlopen, log opnieuw in" }), { status: 401, headers: CORS });
  }
  // ── Einde verificatie ──

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { recordId, velden, annuleer, herstel, email, naam, boekingsnummer } = body;
  if (!recordId) return new Response(JSON.stringify({ error: "recordId ontbreekt" }), { status: 400, headers: CORS });

  try {
    const updateFields = annuleer
      ? { "Status": "Geannuleerd" }
      : herstel
        ? { "Status": "Actief" }
        : { ...velden, "Status": "Gewijzigd" };

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${recordId}`,
      { method: "PATCH", headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: updateFields }) }
    );
    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      return new Response(JSON.stringify({ error: "Airtable: " + err }), { status: 500, headers: CORS });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Airtable: " + err.message }), { status: 500, headers: CORS });
  }

  if (email) {
    try {
      const onderwerp = annuleer ? `Afspraak geannuleerd — ${boekingsnummer}` : herstel ? `Afspraak hersteld — ${boekingsnummer}` : `Afspraak gewijzigd — ${boekingsnummer}`;
      const kleur     = annuleer ? "#dc2626" : herstel ? "#16a34a" : "#0586f0";
      const ikoon     = annuleer ? "❌" : herstel ? "✅" : "✏️";
      const koptekst  = annuleer ? "Uw afspraak is geannuleerd" : herstel ? "Uw afspraak is hersteld" : "Uw afspraak is gewijzigd";
      const rijen = annuleer ? "" : Object.entries(velden || {}).map(([k,v]) => {
        const labels = { Datum:"Datum", Tijdsloten:"Tijdsloten", Diensten:"Diensten", Opties:"Opties", Betaalmethode:"Betaling", Totaal:"Totaal" };
        if (!labels[k]) return null;
        const val = k === "Datum" ? formatDatum(v) : (k === "Totaal" ? "€ " + Number(v).toFixed(2) : v);
        return `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;">${labels[k]}</td><td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;">${val}</td></tr>`;
      }).filter(Boolean).join("");

      const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center"><table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #dde1e9;"><tr><td style="background:${kleur};padding:20px 32px;border-radius:8px 8px 0 0"><img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc21b96d4617d6a3547348_L-rijopleidingen-logo-rgb-diap.svg" alt="L-Rijopleidingen" style="height:28px;width:auto;display:block;margin-bottom:6px;"/><p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;">${koptekst}</p></td></tr><tr><td style="padding:24px 32px;"><p style="font-size:15px;font-weight:600;color:${kleur};margin:0 0 8px;">${ikoon} ${koptekst}</p><p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Boekingsnummer: <strong>${boekingsnummer}</strong></p>${annuleer ? `<p style="font-size:14px;color:#1a1f2e;line-height:1.6;">Beste ${naam},<br><br>Uw afspraak is geannuleerd. Neem contact op via <a href="mailto:info@l-rijopleidingen.nl">info@l-rijopleidingen.nl</a> voor een nieuwe afspraak.</p>` : `<table width="100%" cellpadding="0" cellspacing="0">${rijen}</table>`}</td></tr><tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;border-radius:0 0 8px 8px"><img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69bc2137ec448353135e0a0a_L-rijopleidingen-logo-rgb.svg" alt="L-Rijopleidingen" style="height:18px;width:auto;display:block;margin-bottom:4px;"/><p style="margin:0;font-size:12px;color:#9ca3af;">info@l-rijopleidingen.nl</p></td></tr></table></td></tr></table></body></html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: (env.RESEND_FROM || "").trim(), to: [email], subject: onderwerp, html }),
      });
    } catch (err) { console.error("Mail fout:", err.message); }
  }

  return new Response(JSON.stringify({ success: true, actie: annuleer ? "geannuleerd" : herstel ? "hersteld" : "gewijzigd" }), { status: 200, headers: CORS });
}
