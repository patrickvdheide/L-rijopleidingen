export async function onRequestPost(context) {

  try {
    const formData = await context.request.formData();
    const betalingId = formData.get("id");

    if (!betalingId) return new Response("ok", { status: 200 });

    // Status ophalen bij Mollie
    const res = await fetch(`https://api.mollie.com/v2/payments/${betalingId}`, {
      headers: { "Authorization": `Bearer ${context.env.MOLLIE_API_KEY}` },
    });

    const betaling = await res.json();

    if (betaling.status === "paid") {
      const { naam, email, pakket } = betaling.metadata;

      // Bevestigingsmail via Resend (je bestaande setup)
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${context.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "L-rijopleidingen <noreply@l-rijopleidingen.nl>",
          to: [email],
          subject: "Betaling ontvangen - AVB-examen inschrijving",
          html: `<p>Beste ${naam},</p>
                 <p>Je betaling voor <strong>${pakket}</strong> is ontvangen. 
                    We nemen zo snel mogelijk contact met je op.</p>
                 <p>Met vriendelijke groet,<br>L-rijopleidingen</p>`,
        }),
      });
    }

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("Webhook fout:", err);
    return new Response("ok", { status: 200 }); // altijd 200 terug naar Mollie
  }
}
