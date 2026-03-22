// functions/api/cms-data.js
// Haalt diensten, opties en beschikbaarheid op uit Webflow CMS
// Dit bestand gebruikt géén Airtable — blijft ongewijzigd

const COLLECTIE_DIENSTEN     = "69b9579da76894f8931b3249";
const COLLECTIE_OPTIES       = "69b9584ef5b02a7a23bfc5c9";
const COLLECTIE_BESCHIKBAAR  = "69b9591065d6e29f3cffa8a5";

async function haalOp(collectieId, token) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectieId}/items?limit=100`,
    { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } }
  );
  if (!res.ok) throw new Error("Webflow " + res.status);
  return res.json();
}

function parseDiensten(items) {
  return items.map(item => {
    const f = item.fieldData || {};
    return {
      id:    item.id,
      label: f.name || f.naam || f.label || "Dienst",
      duur:  f.duur  || "60 min",
      info:  f.info  || f.omschrijving || "",
      prijzen: {
        consument: Number(f["prijs-consument"] || f.prijs || 0),
        zzp:       Number(f["prijs-zzp"]       || f.prijs || 0),
        bedrijf:   Number(f["prijs-bedrijf"]   || f.prijs || 0),
      },
    };
  });
}

function parseOpties(items) {
  return items.map(item => {
    const f = item.fieldData || {};
    return {
      id:    item.id,
      label: f.name || f.naam || f.label || "Optie",
      prijs: Number(f.prijs || 0),
      info:  f.info || f.omschrijving || "",
      verplichtConsument:  f["verplicht-consument"]  ?? false,
      zichtbaarConsument:  f["zichtbaar-consument"]  ?? true,
      zichtbaarZzp:        f["zichtbaar-zzp"]        ?? true,
      zichtbaarBedrijf:    f["zichtbaar-bedrijf"]    ?? true,
    };
  });
}

function parseBeschikbaar(items) {
  const fd = items[0]?.fieldData || {};
  return {
    tijdsloten:      (fd?.tijdsloten ?? "08:00,09:00,10:00,11:00,13:00,14:00,15:00,16:00,17:00")
      .split(",").map(t => t.trim()).filter(Boolean),
    weekdagen:       (fd?.weekdagen ?? "1,2,3,4,5")
      .split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n)),
    geblokkeerdeData: (fd?.["geblokkeerde-data"] ?? "")
      .split(",").map(d => d.trim()).filter(Boolean),
  };
}

export async function onRequest(context) {
  const { env } = context;
  const token = env.WEBFLOW_TOKEN;
  if (!token) {
    return Response.json({
      diensten:    [],
      opties:      [],
      beschikbaar: { tijdsloten:["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00"], weekdagen:[1,2,3,4,5], geblokkeerdeData:[] }
    });
  }
  try {
    const [dData, oData, bData] = await Promise.all([
      haalOp(COLLECTIE_DIENSTEN,    token),
      haalOp(COLLECTIE_OPTIES,      token),
      haalOp(COLLECTIE_BESCHIKBAAR, token),
    ]);
    const dItems = dData.items || [];
    const oItems = oData.items || [];
    const bItems = bData.items || [];
    return Response.json({
      diensten:    parseDiensten(dItems),
      opties:      parseOpties(oItems),
      beschikbaar: parseBeschikbaar(bItems),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
