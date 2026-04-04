export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const formulierNaam = body.payload.name;
    const d = body.payload.data;
    const RESEND_API_KEY = context.env.RESEND_API_KEY;

    const adminMail    = "info@l-rijopleidingen.nl";
    const afzenderMail = "no-reply@l-rijopleidingen.nl";
    const afzenderNaam = "L-Rijopleidingen";

    let adminOnderwerp, adminInhoud, klantMail, klantOnderwerp, klantHtml;

    if (formulierNaam === "AVB-examenformulier") {
      const naam        = d["Voornaam"] + " " + d["Achternaam"];
      const examendatum = d["Gewenste examendatum"];
      const pakket      = d["Gewenst pakket"];
      const betaalwijze = d["Gewenste betaalmethode"];
      const adres       = d["Straatnaam"] + " " + d["Huisnummer"] + ", " + d["Postcode"] + " " + d["Woonplaats"];
      const telefoon    = d["Telefoonnummer"];
      klantMail         = d["E-mail"];

      adminOnderwerp = "📋 Nieuwe reservering – " + naam + " (" + examendatum + ")";
      adminInhoud =
        "Nieuwe inschrijving ontvangen via het AVB-examenformulier.\n\n" +
        "Naam: "             + naam        + "\n" +
        "E-mail: "           + klantMail   + "\n" +
        "Telefoon: "         + telefoon    + "\n" +
        "Adres: "            + adres       + "\n" +
        "Pakket: "           + pakket      + "\n" +
        "Examendatum: "      + examendatum + "\n" +
        "Betaalmethode: "    + betaalwijze + "\n" +
        "Rijschoolhouder: "  + d["Rijschoolhouder"]   + "\n" +
        "Bedrijfsnaam: "     + d["Bedrijfsnaam"]       + "\n" +
        "Opleidingsnummer: " + d["Opleidingsnummer"]   + "\n" +
        "Bericht: "          + d["Bericht"]            + "\n" +
        "Machtiging: "       + d["Machtiging"];

      klantOnderwerp = "Bevestiging: jouw AVB-examen aanvraag";
      klantHtml = avbHtml(d, naam, klantMail, telefoon, adres, pakket, examendatum, betaalwijze);

    } else if (formulierNaam === "Contactformulier") {
      const naam    = d["Voornaam"] + " " + d["Achternaam"];
      klantMail     = d["E-mail"];
      const bericht = d["Bericht"];

      adminOnderwerp = "📬 Nieuw contactbericht – " + naam;
      adminInhoud =
        "Nieuw bericht ontvangen via het contactformulier.\n\n" +
        "Naam: "     + naam      + "\n" +
        "E-mail: "   + klantMail + "\n" +
        "Bericht:\n" + bericht;

      klantOnderwerp = "Bedankt voor je bericht – L-Rijopleidingen";
      klantHtml = contactHtml(d, naam, klantMail, bericht);

    } else {
      return new Response("Onbekend formulier", { status: 200 });
    }

    // Admin mail
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: afzenderNaam + " <" + afzenderMail + ">",
        to: [adminMail],
        subject: adminOnderwerp,
        text: adminInhoud
      })
    });

    // Klant mail
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: afzenderNaam + " <" + afzenderMail + ">",
        to: [klantMail],
        subject: klantOnderwerp,
        html: klantHtml
      })
    });

    return new Response("OK", { status: 200 });

  } catch (err) {
    return new Response("Fout: " + err.message, { status: 500 });
  }
}

function rij(label, waarde) {
  if (!waarde || String(waarde).trim() === "" || waarde === "false") return "";
  return `
    <tr>
      <td style="padding:10px 24px;border-top:1px solid #e8edf5;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#8899bb;width:130px;vertical-align:top;padding-top:2px;">${label}</td>
            <td style="font-size:14px;color:#12182b;font-weight:600;">${waarde}</td>
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

function avbHtml(d, naam, klantMail, telefoon, adres, pakket, examendatum, betaalwijze) {
  return headerHtml("Aanvraag ontvangen", "AVB-examen inschrijving") + `
<tr><td style="background-color:#0586f0;padding:14px 40px;">
  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✓ &nbsp;Je inschrijving is succesvol ontvangen</p>
</td></tr>
<tr><td style="padding:36px 40px 24px;">
  <p style="margin:0 0 12px;font-size:17px;color:#12182b;font-weight:700;">Hoi ${d["Voornaam"]},</p>
  <p style="margin:0;font-size:15px;color:#555555;line-height:1.8;">Bedankt voor je aanvraag bij L-Rijopleidingen. We hebben je inschrijving voor het AVB-examen goed ontvangen en nemen zo snel mogelijk contact met je op om alles te bevestigen.</p>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:10px;overflow:hidden;border:1px solid #e8edf5;">
    <tr><td style="padding:18px 24px 12px;">
      <p style="margin:0;font-size:11px;font-weight:800;color:#0586f0;letter-spacing:1.5px;text-transform:uppercase;">Samenvatting aanvraag</p>
    </td></tr>
    ${rij("Naam", naam)}
    ${rij("E-mail", klantMail)}
    ${rij("Telefoon", telefoon)}
    ${rij("Adres", adres)}
    ${rij("Prijs in €", pakket)}
    ${rij("Examendatum", examendatum)}
    ${rij("Betaalmethode", betaalwijze)}
  </table>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-radius:10px;border:1px solid #f5dfc0;">
    <tr><td style="padding:18px 24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:800;color:#e07b00;letter-spacing:1.5px;text-transform:uppercase;">Wat gebeurt er nu?</p>
      <p style="margin:0;font-size:14px;color:#666666;line-height:1.7;">We bekijken je aanvraag en nemen binnen <strong style="color:#12182b;">1 werkdag</strong> contact met je op om de datum en betaling te bevestigen.</p>
    </td></tr>
  </table>
</td></tr>` + footerHtml();
}

function contactHtml(d, naam, klantMail, bericht) {
  return headerHtml("Bericht ontvangen", "Contactformulier") + `
<tr><td style="background-color:#0586f0;padding:14px 40px;">
  <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✓ &nbsp;Je bericht is succesvol ontvangen</p>
</td></tr>
<tr><td style="padding:36px 40px 24px;">
  <p style="margin:0 0 12px;font-size:17px;color:#12182b;font-weight:700;">Hoi ${d["Voornaam"]},</p>
  <p style="margin:0;font-size:15px;color:#555555;line-height:1.8;">Bedankt voor je bericht! We hebben het goed ontvangen en nemen zo snel mogelijk contact met je op.</p>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:10px;overflow:hidden;border:1px solid #e8edf5;">
    <tr><td style="padding:18px 24px 12px;">
      <p style="margin:0;font-size:11px;font-weight:800;color:#0586f0;letter-spacing:1.5px;text-transform:uppercase;">Jouw bericht</p>
    </td></tr>
    ${rij("Naam", naam)}
    ${rij("E-mail", klantMail)}
    ${rij("Bericht", bericht)}
  </table>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border-radius:10px;border:1px solid #f5dfc0;">
    <tr><td style="padding:18px 24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:800;color:#e07b00;letter-spacing:1.5px;text-transform:uppercase;">Wat gebeurt er nu?</p>
      <p style="margin:0;font-size:14px;color:#666666;line-height:1.7;">We lezen je bericht en nemen binnen <strong style="color:#12182b;">1 werkdag</strong> contact met je op via je e-mailadres of telefonisch.</p>
    </td></tr>
  </table>
</td></tr>` + footerHtml();
}
