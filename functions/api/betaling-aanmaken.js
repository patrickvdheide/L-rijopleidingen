const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Vangt OPTIONS preflight op
export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return onRequestPost(context);
}

export async function onRequestPost(context) {

  const headers = {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  };

  try {

    const body = await context.request.json();
    const { voornaam, achternaam, email, telefoon, pakket, bedrag, pakketprijs, reservering } = body;

    // Validatie
    if (!bedrag || isNaN(parseFloat(bedrag)) || parseFloat(bedrag) <= 0) {
      return Response.json(
        { error: "Ongeldig bedrag" },
        { status: 400, headers }
      );
    }

    const naam = `${voornaam} ${achternaam}`.trim();

    const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${context.env.MOLLIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: bedrag, // bijv. "285.00"
        },
        description: `AVB-examen inschrijving - ${pakket} - ${naam}`,
        redirectUrl: "https://l-rijopleidingen.nl/betaling-geslaagd",
        webhookUrl:  "https://l-rijopleidingen.nl/api/betaling-webhook",
        method: "ideal",
        metadata: {
          naam,
          email,
          telefoon,
          pakket,
          reservering, // true/false
          pakketprijs,
          totaal: bedrag,
        },
      }),
    });

    const betaling = await mollieRes.json();

    if (!betaling._links?.checkout?.href) {
      console.error("Mollie fout:", JSON.stringify(betaling));
      return Response.json(
        { error: betaling.detail || "Mollie kon geen betaling aanmaken" },
        { status: 500, headers }
      );
    }

    return Response.json(
      { checkoutUrl: betaling._links.checkout.href },
      { headers }
    );

  } catch (err) {
    console.error("Onverwachte fout:", err);
    return Response.json(
      { error: "Serverfout" },
      { status: 500, headers }
    );
  }
}
