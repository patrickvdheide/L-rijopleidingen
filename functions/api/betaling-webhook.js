export async function onRequestPost(context) {

  try {
    const formData = await context.request.formData();
    const betalingId = formData.get("id");

    if (!betalingId) return new Response("ok", { status: 200 });

    const res = await fetch(`https://api.mollie.com/v2/payments/${betalingId}`, {
      headers: { "Authorization": `Bearer ${context.env.MOLLIE_API_KEY}` },
    });

    const betaling = await res.json();

    if (betaling.status === "paid") {
      const { naam, email, telefoon, pakket, pakketprijs, reservering, totaal } = betaling.metadata;

      const pakketBedrag     = parseFloat(pakketprijs || 0);
      const heeftReservering = reservering === true || reservering === "true";
      const reserveringBedrag = heeftReservering ? 50 : 0;
      const totaalBedrag     = parseFloat(totaal || betaling.amount.value);

      const voornaam = naam?.split(" ")[0] || naam;

      const html = betalingHtml(naam, voornaam, email, telefoon, pakket, pakketBedrag, heeftReservering, reserveringBedrag, totaalBedrag);

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${context.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "L-Rijopleidingen <no-reply@l-rijopleidingen.nl>",
          to: [email],
          subject: `Betaling ontvangen - AVB-examen inschrijving`,
          html,
        }),
      });
    }

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("Webhook fout:", err);
    return new Response("ok", { status: 200 });
  }
}


/* ===============================
   HELPER FUNCTIES (zelfde als contact-webhook.js)
=============================== */

function rij(label, waarde) {
  if (!waarde || String(waarde).trim() === "" || waarde === "false") return "";
  return `
    <tr>
      <td style="padding:10px 24px;border-top:1px solid #e8edf5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#8899bb;width:150px;vertical-align:top;padding-top:2px;">${label}</td>
            <td style="font-size:14px;color:#12182b;font-weight:600;">${waarde}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function rijTotaal(label, waarde) {
  return `
    <tr>
      <td style="padding:10px 24px;border-top:2px solid #0586f0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#12182b;font-weight:800;width:150px;vertical-align:top;padding-top:2px;">${label}</td>
            <td style="font-size:16px;color:#0586f0;font-weight:800;">${waarde}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function headerHtml(titel, subtitel) {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
<tr><td style="background-color:#12182b;padding:36px 40px 32px;text-align:center;">
  <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69d0e3c9654259c2c3e9c18a_L-rijopleidingen-logo-rgb-diap.avif"
       alt="L-Rijopleidingen" width="220" style="display:block;margin:0 auto 20px;height:auto;" />
  <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:800;letter-spacing:-0.5px;">${titel}</h1>
  <p style="margin:10px 0 0;font-size:14px;color:#8899bb;">${subtitel}</p>
</td></tr>`;
}

function footerHtml() {
  return `
<tr><td style="padding:0 40px 40px;text-align:center;">
  <a href="https://l-rijopleidingen.nl" style="display:inline-block;background-color:#0586f0;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 36px;border-radius:50px;">Bekijk onze website →</a>
  <p style="margin:20px 0 0;font-size:13px;color:#999999;">Vragen? Mail naar <a href="mailto:info@l-rijopleidingen.nl" style="color:#0586f0;font-weight:600;text-decoration:none;">info@l-rijopleidingen.nl</a></p>
</td></tr>
<tr><td style="background-color:#12182b;padding:24px 40px;text-align:center;">
  <p style="margin:0 0 4px;font-size:12px;color:#6677aa;font-weight:600;">L-Rijopleidingen · Beverwijk</p>
  <p style="margin:0;font-size:11px;color:#445577;">Dit is een automatische bevestigingsmail — je hoeft hier niet op te reageren.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function betalingHtml(naam, voornaam, email, telefoon, pakket, pakketBedrag, heeftReservering, reserveringBedrag, totaalBedrag) {
  const formatBedrag = (n) =>
    "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return headerHtml("Betaling ontvangen", "AVB-examen inschrijving") + `
<tr><td style="background-color:#0586f0;padding:14px 40px;">
  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✓ &nbsp;Je betaling is succesvol ontvangen</p>
</td></tr>
<tr><td style="padding:36px 40px 24px;">
  <p style="margin:0 0 12px;font-size:17px;color:#12182b;font-weight:700;">Hoi ${voornaam},</p>
  <p style="margin:0;font-size:15px;color:#555555;line-height:1.8;">Bedankt voor je betaling bij L-Rijopleidingen. We hebben je inschrijving voor het AVB-examen goed ontvangen en nemen zo snel mogelijk contact met je op om de examendatum te bevestigen.</p>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:10px;overflow:hidden;border:1px solid #e8edf5;">
    <tr><td style="padding:18px 24px 12px;">
      <p style="margin:0;font-size:11px;font-weight:800;color:#0586f0;letter-spacing:1.5px;text-transform:uppercase;">Samenvatting betaling</p>
    </td></tr>
    ${rij("Naam", naam)}
    ${rij("E-mail", email)}
    ${rij("Telefoon", telefoon)}
    ${rij("Pakket", pakket)}
    ${rij("Pakketprijs", formatBedrag(pakketBedrag))}
    ${heeftReservering ? rij("Reserveringskosten", formatBedrag(reserveringBedrag)) : ""}
    ${rijTotaal("Totaal betaald", formatBedrag(totaalBedrag))}
    ${rij("Betaalmethode", "iDEAL")}
  </table>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-radius:10px;border:1px solid #f5dfc0;">
    <tr><td style="padding:18px 24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:800;color:#e07b00;letter-spacing:1.5px;text-transform:uppercase;">Wat gebeurt er nu?</p>
      <p style="margin:0;font-size:14px;color:#666666;line-height:1.7;">We bekijken je aanvraag en nemen binnen <strong style="color:#12182b;">1 werkdag</strong> contact met je op om de examendatum en verdere details te bevestigen.</p>
    </td></tr>
  </table>
</td></tr>` + footerHtml();
}
