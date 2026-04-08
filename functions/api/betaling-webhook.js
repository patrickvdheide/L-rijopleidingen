const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

      const pakketBedrag    = parseFloat(pakketprijs || 0);
      const heeftReservering = reservering === true || reservering === "true";
      const reserveringBedrag = heeftReservering ? 50 : 0;
      const totaalBedrag    = parseFloat(totaal || betaling.amount.value);

      const formatBedrag = (n) =>
        "€" + Number(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

      const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Betaling ontvangen</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#12182b;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">L rijopleidingen.nl</p>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background-color:#0586f0;padding:28px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#ffffff;font-size:26px;font-weight:700;">Betaling ontvangen ✓</p>
              <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;">AVB-examen inschrijving</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px;">
              <p style="margin:0 0 24px;font-size:17px;color:#12182b;">Hoi ${naam},</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a5568;line-height:1.7;">
                Je betaling is succesvol ontvangen. Hieronder vind je een overzicht van je inschrijving.
                We nemen zo snel mogelijk contact met je op om de examendatum te bevestigen.
              </p>

              <!-- Samenvatting -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td colspan="2" style="background-color:#f8fafc;padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#0586f0;text-transform:uppercase;">Samenvatting betaling</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#718096;font-size:14px;">Naam</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#12182b;font-size:14px;font-weight:600;text-align:right;">${naam}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#718096;font-size:14px;">E-mail</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#12182b;font-size:14px;font-weight:600;text-align:right;">${email}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#718096;font-size:14px;">Pakket</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#12182b;font-size:14px;font-weight:600;text-align:right;">${pakket}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#718096;font-size:14px;">Pakketprijs</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#12182b;font-size:14px;font-weight:600;text-align:right;">${formatBedrag(pakketBedrag)}</td>
                </tr>
                ${heeftReservering ? `
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#718096;font-size:14px;">Reserveringskosten</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #f0f0f0;color:#12182b;font-size:14px;font-weight:600;text-align:right;">${formatBedrag(reserveringBedrag)}</td>
                </tr>` : ""}
                <tr style="background-color:#f8fafc;">
                  <td style="padding:16px 20px;color:#12182b;font-size:15px;font-weight:700;">Totaal betaald</td>
                  <td style="padding:16px 20px;color:#0586f0;font-size:15px;font-weight:700;text-align:right;">${formatBedrag(totaalBedrag)}</td>
                </tr>
              </table>

              <!-- Wat nu -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff8f0;border:1px solid #ffe0b2;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;color:#e65c00;text-transform:uppercase;">Wat gebeurt er nu?</p>
                    <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.7;">
                      We bekijken je aanvraag en nemen binnen <strong>1 werkdag</strong> contact met je op
                      om de examendatum en verdere details te bevestigen.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://l-rijopleidingen.nl" style="display:inline-block;background-color:#0586f0;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
                      Bekijk onze website →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#12182b;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.6);font-size:13px;">Vragen? Mail naar <a href="mailto:info@l-rijopleidingen.nl" style="color:#0586f0;text-decoration:none;">info@l-rijopleidingen.nl</a></p>
              <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;">L-rijopleidingen · Plantage 1A, 1944 JK Beverwijk</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${context.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "L-rijopleidingen <noreply@l-rijopleidingen.nl>",
          to: [email],
          subject: `Betaling ontvangen - ${pakket}`,
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
