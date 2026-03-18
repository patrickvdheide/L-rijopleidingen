// functions/api/cms-data.js
// Cloudflare Pages Function — haalt Webflow CMS data op

const COLLECTIE_DIENSTEN    = "69b9579da76894f8931b3249";
const COLLECTIE_OPTIES      = "69b9584ef5b02a7a23bfc5c9";
const COLLECTIE_BESCHIKBAAR = "69b9591065d6e29f3cffa8a5";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type":                 "application/json",
};

async function haalOp(collectieId, token) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectieId}/items?limit=100`,
    { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Webflow ${collectieId}: ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

function parseDiensten(items) {
  return items
    .filter(i => i.fieldData?.actief !== false)
    .map(i => ({
      id:     i.id,
      label:  i.fieldData?.naam ?? i.fieldData?.name ?? "Onbekend",
      duur:   i.fieldData?.duur ?? "—",
      info:   i.fieldData?.omschrijving ?? "",
      actief: true,
      prijzen: {
        consument: Number(i.fieldData?.["prijs-consument"] ?? 0),
        zzp:       Number(i.fieldData?.["prijs-zzp"]       ?? 0),
        bedrijf:   Number(i.fieldData?.["prijs-bedrijf"]   ?? 0),
      },
    }));
}

function parseOpties(items) {
  return items
    .filter(i => i.fieldData?.actief !== false)
    .map(i => ({
      id:                 i.id,
      label:              i.fieldData?.naam ?? i.fieldData?.name ?? "Onbekend",
      prijs:              Number(i.fieldData?.["prijs-per-slot"] ?? 0),
      info:               i.fieldData?.omschrijving ?? "",
      actief:             true,
      verplichtConsument: i.fieldData?.["verplicht-consument"]          ?? false,
      zichtbaarConsument: i.fieldData?.["zichtbaar-consument"]          ?? true,
      zichtbaarZzp:       i.fieldData?.["zichtbaar-zzp"]                ?? true,
      zichtbaarBedrijf:   i.fieldData?.["zichtbaar-bedrijf"]            ?? true,
    }));
}

function parseBeschikbaar(items) {
  const item = items[0];
  if (!item) return null;
  const fd = item.fieldData;
  return {
    tijdsloten:       (fd?.tijdsloten ?? "08:00,09:00,10:00,11:00,13:00,14:00,15:00,16:00,17:00")
                        .split(",").map(s => s.trim()).filter(Boolean),
    weekdagen:        (fd?.weekdagen ?? "1,2,3,4,5")
                        .split(",").map(Number).filter(Boolean),
    geblokkeerdeData: (fd?.["geblokkeerde-datums"] ?? "")
                        .split(",").map(s => s.trim()).filter(Boolean),
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  const token = env.WEBFLOW_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: "WEBFLOW_TOKEN niet ingesteld" }),
      { status: 500, headers: CORS }
    );
  }

  try {
    const [dItems, oItems, bItems] = await Promise.all([
      haalOp(COLLECTIE_DIENSTEN,    token),
      haalOp(COLLECTIE_OPTIES,      token),
      haalOp(COLLECTIE_BESCHIKBAAR, token),
    ]);

    const body = JSON.stringify({
      diensten:    parseDiensten(dItems),
      opties:      parseOpties(oItems),
      beschikbaar: parseBeschikbaar(bItems),
    });

    return new Response(body, { status: 200, headers: CORS });
  } catch (err) {
    console.error("CMS fout:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: CORS }
    );
  }
}
