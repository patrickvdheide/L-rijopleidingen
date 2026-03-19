// functions/api/wijzig-boeking.js
// Wijzigt of annuleert een boeking in Airtable en stuurt update-mail

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

function formatDatum(str) {
  if (!str) return "—";
  const [j, m, d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m) - 1]} ${j}`;
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type":                 "application/json",
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  // Verifieer sessie token
  const url   = new URL(request.url);
  const token = url.searchParams.get("key");
  const user  = url.searchParams.get("user");
  if (!token || !user) {
    return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), { status: 401, headers: CORS });
  }
  const authRes = await fetch(new URL("/api/admin-auth", request.url).href, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({actie:"verifieer", token, gebruikersnaam:user})
  }).catch(()=>null);
  const authData = authRes ? await authRes.json() : {};
  if (!authRes?.ok || !authData.geldig) {
    return new Response(JSON.stringify({ error: "Sessie verlopen" }), { status: 401, headers: CORS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers: CORS });
  }

  const { recordId, velden, annuleer, herstel, email, naam, boekingsnummer } = body;

  if (!recordId) {
    return new Response(JSON.stringify({ error: "recordId ontbreekt" }), { status: 400, headers: CORS });
  }

  // ── 1. Update Airtable ──
  try {
    const updateFields = annuleer
      ? { "Status": "Geannuleerd" }
      : herstel
        ? { "Status": "Actief" }
        : { ...velden, "Status": "Gewijzigd" };

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: updateFields }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      return new Response(JSON.stringify({ error: "Airtable: " + err }), { status: 500, headers: CORS });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Airtable exception: " + err.message }), { status: 500, headers: CORS });
  }

  // ── 2. Mail sturen ──
  if (email) {
    try {
      const onderwerp = annuleer
        ? `Afspraak geannuleerd — ${boekingsnummer}`
        : herstel
          ? `Afspraak hersteld — ${boekingsnummer}`
          : `Afspraak gewijzigd — ${boekingsnummer}`;

      const kleur   = annuleer ? "#dc2626" : herstel ? "#16a34a" : "#2c6bed";
      const ikoon   = annuleer ? "❌" : herstel ? "✅" : "✏️";
      const koptekst = annuleer ? "Uw afspraak is geannuleerd" : herstel ? "Uw afspraak is hersteld" : "Uw afspraak is gewijzigd";

      const rijen = annuleer ? [] : Object.entries(velden || {}).map(([k,v]) => {
        const labels = {
          Datum:"Datum", Tijdsloten:"Tijdsloten", Diensten:"Diensten",
          Opties:"Opties", Betaalmethode:"Betaling", Totaal:"Totaal"
        };
        if (!labels[k]) return null;
        const val = k === "Datum" ? formatDatum(v) : (k === "Totaal" ? "€ "+Number(v).toFixed(2) : v);
        return `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;width:120px;">${labels[k]}</td>
          <td style="padding:8px 0 8px 12px;border-bottom:1px solid #f3f4f6;color:#1a1f2e;font-size:13px;">${val}</td>
        </tr>`;
      }).filter(Boolean).join("");

      const emailHtml = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><title>${koptekst}</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #dde1e9;">
        <tr><td style="background:${kleur};padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">L-Rijopleidingen</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${koptekst}</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:${annuleer?"#fef2f2":"#f0fdf4"};border-bottom:1px solid ${annuleer?"#fecaca":"#bbf7d0"};">
          <p style="margin:0;font-size:15px;font-weight:600;color:${annuleer?"#dc2626":"#16a34a"};">${ikoon} ${koptekst}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Boekingsnummer: <strong style="color:${kleur};">${boekingsnummer}</strong></p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          ${annuleer
            ? `<p style="font-size:14px;color:#1a1f2e;line-height:1.6;">Beste ${naam},<br><br>Uw afspraak met boekingsnummer <strong>${boekingsnummer}</strong> is geannuleerd door de rijschool.<br><br>Neem contact op via <a href="mailto:info@l-rijopleidingen.nl">info@l-rijopleidingen.nl</a> als u een nieuwe afspraak wilt maken.</p>`
            : herstel
              ? `<p style="font-size:14px;color:#1a1f2e;line-height:1.6;">Beste ${naam},<br><br>Goed nieuws! De annulering van uw afspraak met boekingsnummer <strong>${boekingsnummer}</strong> is ongedaan gemaakt.<br><br>Uw afspraak staat weer op de planning. Zie onderstaande details:</p>
                 <table width="100%" cellpadding="0" cellspacing="0">${rijen}</table>`
              : `<p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Beste ${naam}, uw afspraak is bijgewerkt met de volgende gegevens:</p>
                 <table width="100%" cellpadding="0" cellspacing="0">${rijen}</table>`
          }
        </td></tr>
        <tr><td style="background:#f5f6f8;padding:16px 32px;border-top:1px solid #dde1e9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">L-Rijopleidingen · info@l-rijopleidingen.nl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:    (env.RESEND_FROM || "").trim(),
          to:      [email],
          subject: onderwerp,
          html:    emailHtml,
        }),
      });
    } catch (err) {
      console.error("Mail fout:", err.message);
    }
  }

  return new Response(
    JSON.stringify({ success: true, actie: annuleer ? "geannuleerd" : herstel ? "hersteld" : "gewijzigd" }),
    { status: 200, headers: CORS }
  );
}
