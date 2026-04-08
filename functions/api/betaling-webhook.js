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

      const pakketBedrag      = parseFloat(pakketprijs || 0);
      const heeftReservering  = reservering === true || reservering === "true";
      const reserveringBedrag = heeftReservering ? 50 : 0;
      const totaalBedrag      = parseFloat(totaal || betaling.amount.value);
      const voornaam          = naam?.split(" ")[0] || naam;

      const formatBedrag = (n) =>
        "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

      const html = betalingHtml(naam, voornaam, email, telefoon, pakket, pakketBedrag, heeftReservering, reserveringBedrag, totaalBedrag, formatBedrag);

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
   HELPER FUNCTIES
=============================== */

function rij(label, waarde) {
  if (!waarde || String(waarde).trim() === "" || waarde === "false") return "";
  return `
    <tr>
      <td class="rij-cel" style="padding:10px 24px;border-top:1px solid #e8edf5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td class="rij-label" style="font-size:12px;color:#8899bb;width:160px;vertical-align:top;padding-top:2px;white-space:nowrap;">${label}</td>
            <td class="rij-waarde" style="font-size:14px;color:#12182b;font-weight:600;word-break:break-word;">${waarde}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function cssBlok() {
  return `
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #f0f2f5; }
    .email-wrapper { width: 100%; background-color: #f0f2f5; padding: 40px 0; }
    .email-container { width: 600px; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .email-header { background-color: #12182b; padding: 36px 40px 32px; text-align: center; }
    .email-header img { display: block; margin: 0 auto 20px; height: auto; width: 220px; }
    .email-header h1 { margin: 0; font-size: 26px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px; }
    .email-header p { margin: 10px 0 0; font-size: 14px; color: #8899bb; }
    .email-accent { background-color: #0586f0; padding: 14px 40px; }
    .email-accent p { margin: 0; font-size: 14px; color: #ffffff; font-weight: 600; }
    .email-body { padding: 36px 40px 24px; }
    .email-body .groet { margin: 0 0 12px; font-size: 17px; color: #12182b; font-weight: 700; }
    .email-body .intro { margin: 0; font-size: 15px; color: #555555; line-height: 1.8; }
    .samenvatting-wrapper { padding: 0 40px 32px; }
    .samenvatting { width: 100%; background: #f7f9fc; border-radius: 10px; overflow: hidden; border: 1px solid #e8edf5; border-collapse: collapse; }
    .samenvatting-titel td { padding: 18px 24px 12px; }
    .samenvatting-titel p { margin: 0; font-size: 11px; font-weight: 800; color: #0586f0; letter-spacing: 1.5px; text-transform: uppercase; }
    .rij-label { font-size: 12px; color: #8899bb; width: 160px; vertical-align: top; padding-top: 2px; white-space: nowrap; }
    .rij-waarde { font-size: 14px; color: #12182b; font-weight: 600; word-break: break-word; }
    .info-wrapper { padding: 0 40px 32px; }
    .info-blok { width: 100%; background: #fff8f0; border-radius: 10px; border: 1px solid #f5dfc0; border-collapse: collapse; }
    .info-blok td { padding: 18px 24px; }
    .info-titel { margin: 0 0 8px; font-size: 11px; font-weight: 800; color: #e07b00; letter-spacing: 1.5px; text-transform: uppercase; }
    .info-tekst { margin: 0; font-size: 14px; color: #666666; line-height: 1.7; }
    .cta-wrapper { padding: 0 40px 40px; text-align: center; }
    .cta-knop { display: inline-block; background-color: #0586f0; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 16px 36px; border-radius: 50px; }
    .cta-sub { margin: 20px 0 0; font-size: 13px; color: #999999; }
    .cta-link { color: #0586f0; font-weight: 600; text-decoration: none; }
    .email-footer { background-color: #12182b; padding: 24px 40px; text-align: center; }
    .email-footer .footer-naam { margin: 0 0 4px; font-size: 12px; color: #6677aa; font-weight: 600; }
    .email-footer .footer-sub { margin: 0; font-size: 11px; color: #445577; }

    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .email-header { padding: 28px 24px 24px !important; }
      .email-header img { width: 180px !important; }
      .email-header h1 { font-size: 22px !important; }
      .email-accent { padding: 12px 24px !important; }
      .email-body { padding: 28px 24px 20px !important; }
      .samenvatting-wrapper { padding: 0 24px 24px !important; }
      .info-wrapper { padding: 0 24px 24px !important; }
      .cta-wrapper { padding: 0 24px 32px !important; }
      .email-footer { padding: 20px 24px !important; }
    }

    @media only screen and (max-width: 480px) {
      .email-header { padding: 24px 16px 20px !important; }
      .email-header img { width: 150px !important; margin-bottom: 14px !important; }
      .email-header h1 { font-size: 20px !important; }
      .email-header p { font-size: 12px !important; }
      .email-accent { padding: 10px 16px !important; }
      .email-accent p { font-size: 13px !important; }
      .email-body { padding: 24px 16px 16px !important; }
      .email-body .groet { font-size: 15px !important; }
      .email-body .intro { font-size: 14px !important; }
      .samenvatting-wrapper { padding: 0 16px 20px !important; }
      .samenvatting-titel td { padding: 14px 16px 10px !important; }
      .rij-cel { padding: 10px 16px !important; }
      .rij-label { width: 120px !important; font-size: 11px !important; white-space: normal !important; }
      .rij-waarde { font-size: 13px !important; }
      .info-wrapper { padding: 0 16px 20px !important; }
      .info-blok td { padding: 14px 16px !important; }
      .info-titel { font-size: 10px !important; }
      .info-tekst { font-size: 13px !important; }
      .cta-wrapper { padding: 0 16px 28px !important; }
      .cta-knop { font-size: 14px !important; padding: 14px 24px !important; width: 100% !important; display: block !important; }
      .cta-sub { font-size: 12px !important; }
      .email-footer { padding: 18px 16px !important; }
      .email-footer .footer-naam { font-size: 11px !important; }
      .email-footer .footer-sub { font-size: 10px !important; }
    }
  </style>`;
}

function headerHtml(titel, subtitel) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  ${cssBlok()}
</head>
<body>
<div class="email-wrapper">
  <table class="email-container" cellpadding="0" cellspacing="0" align="center">
    <tr>
      <td class="email-header">
        <img src="https://cdn.prod.website-files.com/69b283988aeea6c6faa49f24/69d0e3c9654259c2c3e9c18a_L-rijopleidingen-logo-rgb-diap.avif" alt="L-Rijopleidingen" width="220" />
        <h1>${titel}</h1>
        <p>${subtitel}</p>
      </td>
    </tr>`;
}

function footerHtml() {
  return `
    <tr>
      <td class="cta-wrapper">
        <a href="https://l-rijopleidingen.nl" class="cta-knop">Bekijk onze website →</a>
        <p class="cta-sub">Vragen? Mail naar <a href="mailto:info@l-rijopleidingen.nl" class="cta-link">info@l-rijopleidingen.nl</a></p>
      </td>
    </tr>
    <tr>
      <td class="email-footer">
        <p class="footer-naam">L-Rijopleidingen · Beverwijk</p>
        <p class="footer-sub">Dit is een automatische bevestigingsmail — je hoeft hier niet op te reageren.</p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
}

function betalingHtml(naam, voornaam, email, telefoon, pakket, pakketBedrag, heeftReservering, reserveringBedrag, totaalBedrag, formatBedrag) {
  return headerHtml("Betaling ontvangen", "AVB-examen inschrijving") + `
    <tr>
      <td class="email-accent">
        <p>✓ &nbsp;Je betaling is succesvol ontvangen</p>
      </td>
    </tr>
    <tr>
      <td class="email-body">
        <p class="groet">Hoi ${voornaam},</p>
        <p class="intro">Bedankt voor je betaling bij L-Rijopleidingen. We hebben je inschrijving voor het AVB-examen goed ontvangen en nemen zo snel mogelijk contact met je op om de examendatum te bevestigen.</p>
      </td>
    </tr>
    <tr>
      <td class="samenvatting-wrapper">
        <table class="samenvatting" cellpadding="0" cellspacing="0">
          <tr class="samenvatting-titel"><td><p>Samenvatting betaling</p></td></tr>
          ${rij("Naam", naam)}
          ${rij("E-mail", email)}
          ${rij("Telefoon", telefoon)}
          ${rij("Pakket", pakket)}
          ${rij("Pakketprijs", formatBedrag(pakketBedrag))}
          ${heeftReservering ? rij("Reserveringskosten", formatBedrag(reserveringBedrag)) : ""}
          ${rij("Totaal betaald", formatBedrag(totaalBedrag))}
          ${rij("Betaalmethode", "iDEAL")}
        </table>
      </td>
    </tr>
    <tr>
      <td class="info-wrapper">
        <table class="info-blok" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p class="info-titel">Wat gebeurt er nu?</p>
              <p class="info-tekst">We bekijken je aanvraag en nemen binnen <strong style="color:#12182b;">1 werkdag</strong> contact met je op om de examendatum en verdere details te bevestigen.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` + footerHtml();
}
