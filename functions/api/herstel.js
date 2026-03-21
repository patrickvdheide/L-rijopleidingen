// functions/api/herstel.js
// Maakt een annulering ongedaan via link in de annuleringsbevestiging

const CORS = { "Content-Type": "text/html; charset=utf-8" };

function pagina(titel, bericht, kleur, icoon) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${titel} — L-Rijopleidingen</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { background:#eef0f5; font-family:'DM Sans',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { background:white; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); padding:40px 32px; max-width:420px; width:90%; text-align:center; }
    .icoon { font-size:48px; margin-bottom:16px; }
    h1 { font-size:20px; font-weight:700; color:#1a1f2e; margin-bottom:8px; }
    p { font-size:14px; color:#6b7280; line-height:1.6; }
    a { display:inline-block; margin-top:20px; background:${kleur}; color:white; text-decoration:none; padding:10px 24px; border-radius:6px; font-weight:600; font-size:14px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icoon">${icoon}</div>
    <h1>${titel}</h1>
    <p>${bericht}</p>
    <a href="/">Terug naar boekingen</a>
  </div>
</body>
</html>`;
}

const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
function formatDatum(str) {
  if (!str) return "—";
  const [j,m,d] = str.split("-");
  return `${parseInt(d)} ${MAANDEN[parseInt(m)-1]} ${j}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const id    = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!id || !token) {
    return new Response(pagina("Ongeldige link", "De herstelLink is ongeldig of verlopen.", "#dc2626", "❌"), { status: 400, headers: CORS });
  }

  // Verifieer token
  const verwacht = btoa(id).replace(/=/g,"").slice(0,12);
  if (token !== verwacht) {
    return new Response(pagina("Ongeldige link", "De herstelLink is niet geldig.", "#dc2626", "❌"), { status: 403, headers: CORS });
  }

  try {
    // Zoek de boeking op
    const zoekRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2?filterByFormula=${encodeURIComponent(`{Boekingsnummer}="${id}"`)}`,
      { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
    );
    if (!zoekRes.ok) throw new Error("Airtable zoek: " + zoekRes.status);
    const zoekData = await zoekRes.json();
    const record   = zoekData.records?.[0];

    if (!record) {
      return new Response(pagina("Boeking niet gevonden", `Boeking ${id} is niet gevonden.`, "#6b7280", "🔍"), { status: 404, headers: CORS });
    }

    const status = record.fields?.Status;
    if (status !== "Geannuleerd") {
      return new Response(pagina("Al actief", "Deze afspraak is niet geannuleerd of is al hersteld.", "#16a34a", "✅"), { status: 200, headers: CORS });
    }

    // Herstel de boeking
    const updateRes = await fetch(
      `https://api.airtable.com/v0/appchbjgwoZQiQjfv/tbldfoJwamosk33o2/${record.id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { "Status": "Actief" } }),
      }
    );
    if (!updateRes.ok) throw new Error("Airtable update: " + updateRes.status);

    // Stuur herstelbevestiging
    const naam  = record.fields?.Naam  || "Klant";
    const email = record.fields?.Email || "";
    const datum = record.fields?.Datum || "";

    if (email && env.RESEND_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    (env.RESEND_FROM || "").trim(),
          to:      [email],
          subject: `Afspraak hersteld — ${id}`,
          html:    `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"></head>
          <body style="margin:0;padding:32px;background:#f5f6f8;font-family:Arial,sans-serif;">
            <div style="max-width:500px;margin:0 auto;background:white;border-radius:8px;border:1px solid #dde1e9;overflow:hidden;">
              <div style="background:#16a34a;padding:20px 32px;">
                <img src="data:image/svg+xml;base64,PHN2ZyBzdHlsZT0iaGVpZ2h0OjEwMCU7d2lkdGg6YXV0bztkaXNwbGF5OmJsb2NrOyIgaWQ9IkxhYWdfMiIgZGF0YS1uYW1lPSJMYWFnIDIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDIxNzguNzEgMzMyLjQ1Ij4gPGcgaWQ9IkxhYWdfMS0yIiBkYXRhLW5hbWU9IkxhYWcgMSI+IDxnPiA8Zz4gPHJlY3QgZmlsbD0iIzA1ODZmMCIgd2lkdGg9IjMxMS4zMiIgaGVpZ2h0PSIzMzIuNDUiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTk0LjYsNjYuMzVoNDQuMzZ2MTU4LjA5aDc3Ljc2djQxLjY2aC0xMjIuMTJWNjYuMzVaIi8+IDwvZz4gPGc+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0zOTguNTksMTI3LjcxaDM4LjI0djE4LjM5YzcuMDItOS42OCwxNS45Ny0xOC4zOSwzMy44OC0xOC4zOWgxMi4xdjM0LjM2aC0xNi4yMWMtMTIuMSwwLTIxLjA1LDIuMTgtMjkuNzcsNy4yNnY4OS4wNmgtMzguMjRWMTI3LjcxWiIvPiA8cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNNTAwLjk2LDgxLjczaDQwLjE3djMyLjE5aC00MC4xN3YtMzIuMTlaTTUwMS45MywxMjcuNzFoMzguMjR2MTMwLjY4aC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik01NDguMzksMjc1LjU3bDE5LjEyLTguOTVjMi42Ni0uOTcsNC4zNi0yLjY2LDQuMzYtNS41N1YxMjcuNzFoMzguMjR2MTM2Ljk3YzAsMjAuNTctMTEuMzcsMjcuNTktMzEuNDYsMzEuMjJsLTMwLjI1LDUuMzJ2LTI1LjY1Wk01NzAuNjUsODEuNzNoNDAuMTd2MzIuMTloLTQwLjE3di0zMi4xOVoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTYzNS41MSwyMjcuMTd2LTY4LjI1YzAtMjEuMyw5LjkyLTMxLjIyLDMxLjIyLTMxLjIyaDQ5Ljg1YzIxLjMsMCwzMS4yMiw5LjkyLDMxLjIyLDMxLjIydjY4LjI1YzAsMjEuMy05LjkyLDMxLjIyLTMxLjIyLDMxLjIyaC00OS44NWMtMjEuMywwLTMxLjIyLTkuOTItMzEuMjItMzEuMjJaTTcwNC45NiwyMjYuOTNjMy44NywwLDUuMDgtMS40NSw1LjA4LTUuMDh2LTU3LjZjMC0zLjg3LTEuMjEtNS4wOC01LjA4LTUuMDhoLTI2LjYyYy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOHY1Ny42YzAsMy42MywxLjIxLDUuMDgsNS4wOCw1LjA4aDI2LjYyWiIvPiA8cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNNzczLjY5LDEyNy43MWgzOC4yNHYxNy4xOGM3LjUtOS42OCwxNi45NC0xOC4zOSw0MC4xNy0xOC4zOSwyNy4xLDAsMzYuNTQsOS45MiwzNi41NCwzMi40M3Y2OC4yNWMwLDIyLjUxLTkuNDQsMzIuNDMtMzYuNTQsMzIuNDMtMjMuMjMsMC0zMi42Ny04LjcxLTQwLjE3LTE4LjYzdjU2LjE0aC0zOC4yNFYxMjcuNzFaTTg1MC40LDIyMS4xMnYtNTYuMTVjMC01LjA4LTEuNjktNi4yOS04Ljk1LTYuMjktMTIuMzQsMC0yMC4zMywyLjE4LTI5LjUyLDcuMjZ2NTQuMjFjOS4yLDQuODQsMTcuMTgsNy4yNiwyOS41Miw3LjI2LDcuMjYsMCw4Ljk1LTEuNDUsOC45NS02LjI5WiIvPiA8cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNOTEzLjMyLDgxLjczaDM4LjI0djE3Ni42NmgtMzguMjRWODEuNzNaIi8+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMDE0LjQ4LDIwMi45N3YyMC44MWMwLDMuNjMsMS4yMSw1LjA4LDUuMDgsNS4wOGgyNC42OGMzLjYzLDAsNS4wOC0xLjQ1LDUuMDgtNS4wOHYtOC40N2gzNy45OXYxMS44NmMwLDIxLjMtOS45MiwzMS4yMi0zMS4yMiwzMS4yMmgtNDguNGMtMjEuMywwLTMxLjIyLTkuOTItMzEuMjItMzEuMjJ2LTY4LjI1YzAtMjEuMyw5LjkyLTMxLjIyLDMxLjIyLTMxLjIyaDQ4LjRjMjEuMywwLDMxLjIyLDkuOTIsMzEuMjIsMzEuMjJ2NDQuMDRoLTcyLjg0Wk0xMDE0LjQ4LDE2Mi4zMnYxNy40MmgzNC44NXYtMTcuNDJjMC0zLjg3LTEuNDUtNS4wOC01LjA4LTUuMDhoLTI0LjY4Yy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOFoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTExMTEuMDMsODEuNzNoNDAuMTd2MzIuMTloLTQwLjE3di0zMi4xOVpNMTExMiwxMjcuNzFoMzguMjR2MTMwLjY4aC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMTc1LjY0LDIyNy4xN3YtNjguMjVjMC0yMi41MSw5LjQ0LTMyLjQzLDM2LjMtMzIuNDMsMjMuNDcsMCwzMi42Nyw4LjcxLDQwLjQyLDE4LjM5di02My4xNmgzOC4yNHYxNzYuNjZoLTM4LjI0di0xNy40MmMtNy43NCw5LjkyLTE2Ljk0LDE4LjYzLTQwLjQyLDE4LjYzLTI2Ljg2LDAtMzYuMy05LjkyLTM2LjMtMzIuNDNaTTEyNTIuMzYsMjIwLjE2di01NC4yMWMtOS4yLTUuMDgtMTcuMTgtNy4yNi0yOS43Ny03LjI2LTcuMjYsMC04LjcxLDEuMjEtOC43MSw2LjI5djU2LjE1YzAsNC44NCwxLjQ1LDYuMjksOC43MSw2LjI5LDEyLjU4LDAsMjAuNTctMi40MiwyOS43Ny03LjI2WiIvPiA8cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNMTMxNy42OSw4MS43M2g0MC4xN3YzMi4xOWgtNDAuMTd2LTMyLjE5Wk0xMzE4LjY2LDEyNy43MWgzOC4yNHYxMzAuNjhoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTEzODQuOTcsMTI3LjcxaDM4LjI0djE3LjE4YzcuNS05LjkyLDE2Ljk0LTE4LjYzLDM5LjIxLTE4LjYzLDI1LjY1LDAsMzUuNTcsOS45MiwzNS41NywzMS43djEwMC40M2gtMzguMjR2LTkzLjQxYzAtNC4xMS0xLjIxLTUuNTctNy41LTUuNTctMTIuMzQsMC0xOS44NCwyLjQyLTI5LjA0LDcuMjZ2OTEuNzJoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTE1NDAuMDksMjY3LjM1aDU0LjQ1YzMuNjMsMCw1LjA4LTEuMjEsNS4wOC01LjA4di0yNy44M2MtNy43NCw5LjkyLTE2Ljk0LDE4LjYzLTQwLjQxLDE4LjYzLTI2Ljg2LDAtMzYuMy05LjkyLTM2LjU0LTMyLjQzbC4yNC02MS43MWMwLTIyLjUxLDkuNDQtMzIuNDMsMzYuMy0zMi40MywyMy40NywwLDMyLjY3LDguNzEsNDAuNDEsMTguMzl2LTE3LjE4aDM4LjI0djEzOC4xOGMwLDIxLjMtOS45MiwzMS4yMi0zMS4yMiwzMS4yMmgtNjYuNTV2LTI5Ljc3Wk0xNTk5LjYyLDIxMy42MnYtNDcuNjhjLTkuMi01LjA4LTE3LjE4LTcuMjYtMjkuNzctNy4yNi03LjI2LDAtOC43MSwxLjIxLTguNzEsNS4wOHY1Mi4wM2MwLDMuNjMsMS40NSw1LjA4LDguNzEsNS4wOCwxMi41OCwwLDIwLjU3LTIuNDIsMjkuNzctNy4yNloiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTE3MDEuNSwyMDIuOTd2MjAuODFjMCwzLjYzLDEuMjEsNS4wOCw1LjA4LDUuMDhoMjQuNjhjMy42MywwLDUuMDgtMS40NSw1LjA4LTUuMDh2LTguNDdoMzcuOTl2MTEuODZjMCwyMS4zLTkuOTIsMzEuMjItMzEuMjIsMzEuMjJoLTQ4LjRjLTIxLjMsMC0zMS4yMi05LjkyLTMxLjIyLTMxLjIydi02OC4yNWMwLTIxLjMsOS45Mi0zMS4yMiwzMS4yMi0zMS4yMmg0OC40YzIxLjMsMCwzMS4yMiw5LjkyLDMxLjIyLDMxLjIydjQ0LjA0aC03Mi44NFpNMTcwMS41LDE2Mi4zMnYxNy40MmgzNC44NXYtMTcuNDJjMC0zLjg3LTEuNDUtNS4wOC01LjA4LTUuMDhoLTI0LjY4Yy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOFoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTE3OTkuMjYsMTI3LjcxaDM4LjI0djE3LjE4YzcuNS05LjkyLDE2Ljk0LTE4LjYzLDM5LjIxLTE4LjYzLDI1LjY1LDAsMzUuNTcsOS45MiwzNS41NywzMS43djEwMC40M2gtMzguMjR2LTkzLjQxYzAtNC4xMS0xLjIxLTUuNTctNy41LTUuNTctMTIuMzQsMC0xOS44NCwyLjQyLTI5LjA0LDcuMjZ2OTEuNzJoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTE5MzYuNDcsMjE5LjQzaDM5LjIxdjM4Ljk2aC0zOS4yMXYtMzguOTZaIi8+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0yMDAxLjA5LDEyNy43MWgzOC4yNHYxNy4xOGM3LjUtOS45MiwxNi45NC0xOC42MywzOS4yMS0xOC42MywyNS42NSwwLDM1LjU3LDkuOTIsMzUuNTcsMzEuN3YxMDAuNDNoLTM4LjI0di05My40MWMwLTQuMTEtMS4yMS01LjU3LTcuNS01LjU3LTEyLjM0LDAtMTkuODQsMi40Mi0yOS4wNCw3LjI2djkxLjcyaC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0yMTQwLjQ4LDgxLjczaDM4LjI0djE3Ni42NmgtMzguMjRWODEuNzNaIi8+IDwvZz4gPC9nPiA8L2c+IDwvc3ZnPg==" alt="L-Rijopleidingen" style="height:30px;width:auto;display:block;margin-bottom:6px;"/>
                <p style="margin:0;color:rgba(255,255,255,0.85);font-size:13px;">✅ Afspraak hersteld</p>
              </div>
              <div style="padding:24px 32px;">
                <p style="font-size:14px;color:#1a1f2e;line-height:1.6;">Beste ${naam},<br><br>
                De annulering van uw afspraak op <strong>${formatDatum(datum)}</strong> (boekingsnummer <strong>${id}</strong>) is ongedaan gemaakt.<br><br>
                Uw afspraak staat weer actief. Neem contact op via <a href="mailto:info@l-rijopleidingen.nl">info@l-rijopleidingen.nl</a> bij vragen.</p>
              </div>
              <div style="background:#f5f6f8;padding:12px 32px;border-top:1px solid #dde1e9;">
                <img src="data:image/svg+xml;base64,PHN2ZyBzdHlsZT0iaGVpZ2h0OjEwMCU7d2lkdGg6YXV0bztkaXNwbGF5OmJsb2NrOyIgaWQ9IkxhYWdfMiIgZGF0YS1uYW1lPSJMYWFnIDIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDIxNzguNzEgMzMyLjQ1Ij4gPGcgaWQ9IkxhYWdfMS0yIiBkYXRhLW5hbWU9IkxhYWcgMSI+IDxnPiA8Zz4gPHJlY3QgZmlsbD0iIzA1ODZmMCIgd2lkdGg9IjMxMS4zMiIgaGVpZ2h0PSIzMzIuNDUiLz4gPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTk0LjYsNjYuMzVoNDQuMzZ2MTU4LjA5aDc3Ljc2djQxLjY2aC0xMjIuMTJWNjYuMzVaIi8+IDwvZz4gPGc+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik0zOTguNTksMTI3LjcxaDM4LjI0djE4LjM5YzcuMDItOS42OCwxNS45Ny0xOC4zOSwzMy44OC0xOC4zOWgxMi4xdjM0LjM2aC0xNi4yMWMtMTIuMSwwLTIxLjA1LDIuMTgtMjkuNzcsNy4yNnY4OS4wNmgtMzguMjRWMTI3LjcxWiIvPiA8cGF0aCBmaWxsPSIjMWExZjJlIiBkPSJNNTAwLjk2LDgxLjczaDQwLjE3djMyLjE5aC00MC4xN3YtMzIuMTlaTTUwMS45MywxMjcuNzFoMzguMjR2MTMwLjY4aC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik01NDguMzksMjc1LjU3bDE5LjEyLTguOTVjMi42Ni0uOTcsNC4zNi0yLjY2LDQuMzYtNS41N1YxMjcuNzFoMzguMjR2MTM2Ljk3YzAsMjAuNTctMTEuMzcsMjcuNTktMzEuNDYsMzEuMjJsLTMwLjI1LDUuMzJ2LTI1LjY1Wk01NzAuNjUsODEuNzNoNDAuMTd2MzIuMTloLTQwLjE3di0zMi4xOVoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTYzNS41MSwyMjcuMTd2LTY4LjI1YzAtMjEuMyw5LjkyLTMxLjIyLDMxLjIyLTMxLjIyaDQ5Ljg1YzIxLjMsMCwzMS4yMiw5LjkyLDMxLjIyLDMxLjIydjY4LjI1YzAsMjEuMy05LjkyLDMxLjIyLTMxLjIyLDMxLjIyaC00OS44NWMtMjEuMywwLTMxLjIyLTkuOTItMzEuMjItMzEuMjJaTTcwNC45NiwyMjYuOTNjMy44NywwLDUuMDgtMS40NSw1LjA4LTUuMDh2LTU3LjZjMC0zLjg3LTEuMjEtNS4wOC01LjA4LTUuMDhoLTI2LjYyYy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOHY1Ny42YzAsMy42MywxLjIxLDUuMDgsNS4wOCw1LjA4aDI2LjYyWiIvPiA8cGF0aCBmaWxsPSIjMWExZjJlIiBkPSJNNzczLjY5LDEyNy43MWgzOC4yNHYxNy4xOGM3LjUtOS42OCwxNi45NC0xOC4zOSw0MC4xNy0xOC4zOSwyNy4xLDAsMzYuNTQsOS45MiwzNi41NCwzMi40M3Y2OC4yNWMwLDIyLjUxLTkuNDQsMzIuNDMtMzYuNTQsMzIuNDMtMjMuMjMsMC0zMi42Ny04LjcxLTQwLjE3LTE4LjYzdjU2LjE0aC0zOC4yNFYxMjcuNzFaTTg1MC40LDIyMS4xMnYtNTYuMTVjMC01LjA4LTEuNjktNi4yOS04Ljk1LTYuMjktMTIuMzQsMC0yMC4zMywyLjE4LTI5LjUyLDcuMjZ2NTQuMjFjOS4yLDQuODQsMTcuMTgsNy4yNiwyOS41Miw3LjI2LDcuMjYsMCw4Ljk1LTEuNDUsOC45NS02LjI5WiIvPiA8cGF0aCBmaWxsPSIjMWExZjJlIiBkPSJNOTEzLjMyLDgxLjczaDM4LjI0djE3Ni42NmgtMzguMjRWODEuNzNaIi8+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik0xMDE0LjQ4LDIwMi45N3YyMC44MWMwLDMuNjMsMS4yMSw1LjA4LDUuMDgsNS4wOGgyNC42OGMzLjYzLDAsNS4wOC0xLjQ1LDUuMDgtNS4wOHYtOC40N2gzNy45OXYxMS44NmMwLDIxLjMtOS45MiwzMS4yMi0zMS4yMiwzMS4yMmgtNDguNGMtMjEuMywwLTMxLjIyLTkuOTItMzEuMjItMzEuMjJ2LTY4LjI1YzAtMjEuMyw5LjkyLTMxLjIyLDMxLjIyLTMxLjIyaDQ4LjRjMjEuMywwLDMxLjIyLDkuOTIsMzEuMjIsMzEuMjJ2NDQuMDRoLTcyLjg0Wk0xMDE0LjQ4LDE2Mi4zMnYxNy40MmgzNC44NXYtMTcuNDJjMC0zLjg3LTEuNDUtNS4wOC01LjA4LTUuMDhoLTI0LjY4Yy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOFoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTExMTEuMDMsODEuNzNoNDAuMTd2MzIuMTloLTQwLjE3di0zMi4xOVpNMTExMiwxMjcuNzFoMzguMjR2MTMwLjY4aC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik0xMTc1LjY0LDIyNy4xN3YtNjguMjVjMC0yMi41MSw5LjQ0LTMyLjQzLDM2LjMtMzIuNDMsMjMuNDcsMCwzMi42Nyw4LjcxLDQwLjQyLDE4LjM5di02My4xNmgzOC4yNHYxNzYuNjZoLTM4LjI0di0xNy40MmMtNy43NCw5LjkyLTE2Ljk0LDE4LjYzLTQwLjQyLDE4LjYzLTI2Ljg2LDAtMzYuMy05LjkyLTM2LjMtMzIuNDNaTTEyNTIuMzYsMjIwLjE2di01NC4yMWMtOS4yLTUuMDgtMTcuMTgtNy4yNi0yOS43Ny03LjI2LTcuMjYsMC04LjcxLDEuMjEtOC43MSw2LjI5djU2LjE1YzAsNC44NCwxLjQ1LDYuMjksOC43MSw2LjI5LDEyLjU4LDAsMjAuNTctMi40MiwyOS43Ny03LjI2WiIvPiA8cGF0aCBmaWxsPSIjMWExZjJlIiBkPSJNMTMxNy42OSw4MS43M2g0MC4xN3YzMi4xOWgtNDAuMTd2LTMyLjE5Wk0xMzE4LjY2LDEyNy43MWgzOC4yNHYxMzAuNjhoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTEzODQuOTcsMTI3LjcxaDM4LjI0djE3LjE4YzcuNS05LjkyLDE2Ljk0LTE4LjYzLDM5LjIxLTE4LjYzLDI1LjY1LDAsMzUuNTcsOS45MiwzNS41NywzMS43djEwMC40M2gtMzguMjR2LTkzLjQxYzAtNC4xMS0xLjIxLTUuNTctNy41LTUuNTctMTIuMzQsMC0xOS44NCwyLjQyLTI5LjA0LDcuMjZ2OTEuNzJoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTE1NDAuMDksMjY3LjM1aDU0LjQ1YzMuNjMsMCw1LjA4LTEuMjEsNS4wOC01LjA4di0yNy44M2MtNy43NCw5LjkyLTE2Ljk0LDE4LjYzLTQwLjQxLDE4LjYzLTI2Ljg2LDAtMzYuMy05LjkyLTM2LjU0LTMyLjQzbC4yNC02MS43MWMwLTIyLjUxLDkuNDQtMzIuNDMsMzYuMy0zMi40MywyMy40NywwLDMyLjY3LDguNzEsNDAuNDEsMTguMzl2LTE3LjE4aDM4LjI0djEzOC4xOGMwLDIxLjMtOS45MiwzMS4yMi0zMS4yMiwzMS4yMmgtNjYuNTV2LTI5Ljc3Wk0xNTk5LjYyLDIxMy42MnYtNDcuNjhjLTkuMi01LjA4LTE3LjE4LTcuMjYtMjkuNzctNy4yNi03LjI2LDAtOC43MSwxLjIxLTguNzEsNS4wOHY1Mi4wM2MwLDMuNjMsMS40NSw1LjA4LDguNzEsNS4wOCwxMi41OCwwLDIwLjU3LTIuNDIsMjkuNzctNy4yNloiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTE3MDEuNSwyMDIuOTd2MjAuODFjMCwzLjYzLDEuMjEsNS4wOCw1LjA4LDUuMDhoMjQuNjhjMy42MywwLDUuMDgtMS40NSw1LjA4LTUuMDh2LTguNDdoMzcuOTl2MTEuODZjMCwyMS4zLTkuOTIsMzEuMjItMzEuMjIsMzEuMjJoLTQ4LjRjLTIxLjMsMC0zMS4yMi05LjkyLTMxLjIyLTMxLjIydi02OC4yNWMwLTIxLjMsOS45Mi0zMS4yMiwzMS4yMi0zMS4yMmg0OC40YzIxLjMsMCwzMS4yMiw5LjkyLDMxLjIyLDMxLjIydjQ0LjA0aC03Mi44NFpNMTcwMS41LDE2Mi4zMnYxNy40MmgzNC44NXYtMTcuNDJjMC0zLjg3LTEuNDUtNS4wOC01LjA4LTUuMDhoLTI0LjY4Yy0zLjg3LDAtNS4wOCwxLjIxLTUuMDgsNS4wOFoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTE3OTkuMjYsMTI3LjcxaDM4LjI0djE3LjE4YzcuNS05LjkyLDE2Ljk0LTE4LjYzLDM5LjIxLTE4LjYzLDI1LjY1LDAsMzUuNTcsOS45MiwzNS41NywzMS43djEwMC40M2gtMzguMjR2LTkzLjQxYzAtNC4xMS0xLjIxLTUuNTctNy41LTUuNTctMTIuMzQsMC0xOS44NCwyLjQyLTI5LjA0LDcuMjZ2OTEuNzJoLTM4LjI0VjEyNy43MVoiLz4gPHBhdGggZmlsbD0iIzFhMWYyZSIgZD0iTTE5MzYuNDcsMjE5LjQzaDM5LjIxdjM4Ljk2aC0zOS4yMXYtMzguOTZaIi8+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik0yMDAxLjA5LDEyNy43MWgzOC4yNHYxNy4xOGM3LjUtOS45MiwxNi45NC0xOC42MywzOS4yMS0xOC42MywyNS42NSwwLDM1LjU3LDkuOTIsMzUuNTcsMzEuN3YxMDAuNDNoLTM4LjI0di05My40MWMwLTQuMTEtMS4yMS01LjU3LTcuNS01LjU3LTEyLjM0LDAtMTkuODQsMi40Mi0yOS4wNCw3LjI2djkxLjcyaC0zOC4yNFYxMjcuNzFaIi8+IDxwYXRoIGZpbGw9IiMxYTFmMmUiIGQ9Ik0yMTQwLjQ4LDgxLjczaDM4LjI0djE3Ni42NmgtMzguMjRWODEuNzNaIi8+IDwvZz4gPC9nPiA8L2c+IDwvc3ZnPg==" alt="L-Rijopleidingen" style="height:20px;width:auto;vertical-align:middle;margin-right:6px;"/>
                <p style="margin:0;font-size:12px;color:#9ca3af;">info@l-rijopleidingen.nl</p>
              </div>
            </div>
          </body></html>`
        }),
      });
    }

    return new Response(
      pagina("Afspraak hersteld", `Beste ${naam}, uw afspraak van ${formatDatum(datum)} is succesvol hersteld. U ontvangt een bevestigingsmail.`, "#16a34a", "✅"),
      { status: 200, headers: CORS }
    );

  } catch(err) {
    console.error("Herstel fout:", err.message);
    return new Response(pagina("Er ging iets mis", "Probeer het later opnieuw of neem contact op met de rijschool.", "#dc2626", "⚠️"), { status: 500, headers: CORS });
  }
}
