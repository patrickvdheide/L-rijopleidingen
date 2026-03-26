// functions/api/cms-data.js
// Haalt diensten, opties en beschikbaarheid live op uit Webflow CMS
// GEEN caching — altijd actuele data

const COLLECTIE_DIENSTEN    = "69b9579da76894f8931b3249";
const COLLECTIE_OPTIES      = "69b9584ef5b02a7a23bfc5c9";
const COLLECTIE_BESCHIKBAAR = "69b9591065d6e29f3cffa8a5";
const COLLECTIE_KLANTTYPES  = "69c12855d0a90ac9efcf1dab";

async function haalOp(collectieId, token) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectieId}/items?limit=100&live=true`,
    { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Webflow ${res.status}: ${await res.text()}`);
  return res.json();
}

function vind(f, ...keys) {
  for (const k of keys) {
    if (f[k] !== undefined && f[k] !== null && f[k] !== "") return f[k];
  }
  return undefined;
}
function vindPrijs(f, ...keys) {
  const v = vind(f, ...keys);
  return v !== undefined ? (Number(v) || 0) : 0;
}

function parseDiensten(items) {
  return items.map(item => {
    const f = item.fieldData || {};
    return {
      id:    item.id,
      label: vind(f, "name","naam","label","titel") || "Dienst",
      duur:  vind(f, "duur","duration","tijd") || "60 min",
      info:  vind(f, "info","omschrijving","description","beschrijving") || "",
      prijzen: {
        consument: vindPrijs(f,"prijs-consument","prijs-particulier","prijs-cursist","price-consumer","prijs-incl-btw","prijs-incl","prijs-bruto","prijs","price"),
        zzp:       vindPrijs(f,"prijs-zzp","prijs-instructeur","prijs-zelfstandige","price-zzp","price-instructor","prijs-excl-btw","prijs-netto","prijs-excl","prijs","price"),
        bedrijf:   vindPrijs(f,"prijs-bedrijf","prijs-rijschoolhouder","prijs-rijschool","price-business","price-company","prijs-organisatie","prijs-b2b","prijs","price"),
      },
    };
  });
}

function vindPrijsSlim(f) {
  // Exacte veldnamen eerst (gezien in Webflow screenshots)
  for (const exactKey of ["prijs","price","prijs-per-slot","bedrag","kosten"]) {
    if (f[exactKey] !== undefined && f[exactKey] !== null) {
      const val = Number(f[exactKey]);
      if (!isNaN(val)) return val;
    }
  }
  // Fallback: zoek op pattern
  for (const key in f) {
    if (/prijs|price|bedrag|kosten/i.test(key)) {
      const val = Number(f[key]);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return 0;
}

function parseOpties(items) {
  if (!items || !items.length) return [];
  return items.map(item => {
    const f = item.fieldData || {};
    if (f.actief === false) return null;
    const label = vind(f, "name","naam","label","titel") || "Optie";
    const isMotor = /motor|lesmotor/i.test(label);
    return {
      id:    item.id,
      label,
      prijs: vindPrijsSlim(f),
      info:  vind(f,"info","omschrijving","description","beschrijving") || "",
      zichtbaarBedrijf: vind(f,"zichtbaar-bedrijf","zichtbaar-rijschool","show-business") ?? true,
      minAantal: isMotor ? 1 : 0,
      maxAantal: isMotor ? 6 : 1,
    };
  }).filter(Boolean);
}

function parseBeschikbaar(items) {
  const fd = items[0]?.fieldData || {};
  const dagStr  = vind(fd,"weekdagen","werkdagen","beschikbare-dagen","days","dagen") ?? "1,2,3,4,5";
  const blokStr = vind(fd,"geblokkeerde-data","blocked-dates","uitzonderingen","geblokkeerd") ?? "";
  return {
    weekdagen:        dagStr.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n)),
    geblokkeerdeData: blokStr.split(",").map(d=>d.trim()).filter(Boolean),
  };
}

const VASTE_TIJDBLOKKEN = [
  { id:"08-10", label:"08:00 – 10:00", start:"08:00", eind:"10:00" },
  { id:"10-12", label:"10:00 – 12:00", start:"10:00", eind:"12:00" },
  { id:"13-15", label:"13:00 – 15:00", start:"13:00", eind:"15:00" },
  { id:"15-17", label:"15:00 – 17:00", start:"15:00", eind:"17:00" },
];

const FALLBACK = {
  diensten:    [{ id:"locatie", label:"Locatie", duur:"90 min", info:"CBR-gecertificeerde oefenlocatie", prijzen:{ consument:100, zzp:100, bedrijf:100 } }],
  opties:      [{ id:"motor", label:"Motor van L-rijopleidingen", prijs:100, info:"Gebruik van motor op locatie aanwezig", zichtbaarBedrijf:true, minAantal:1, maxAantal:6 }],
  beschikbaar: { weekdagen:[1,3,5], geblokkeerdeData:[] },
  tijdblokken: VASTE_TIJDBLOKKEN,
};

export async function onRequest(context) {
  const { request, env } = context;
  const token = env.WEBFLOW_TOKEN;
  const url   = new URL(request.url);
  const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

  if (url.searchParams.get("debug") === "1") {
    if (url.searchParams.get("key") !== token) {
      return Response.json({ error: "Onbevoegd" }, { status: 403, headers: NO_CACHE });
    }
    try {
      const [dData, oData, bData] = await Promise.all([
        haalOp(COLLECTIE_DIENSTEN, token),
        haalOp(COLLECTIE_OPTIES,   token),
        haalOp(COLLECTIE_BESCHIKBAAR, token),
      ]);
      return Response.json({
        diensten_geparsed: parseDiensten(dData.items||[]),
        opties_geparsed:   parseOpties(oData.items||[]),
        diensten_raw:  (dData.items||[]).map(i=>({id:i.id,fieldData:i.fieldData})),
        opties_raw:    (oData.items||[]).map(i=>({id:i.id,fieldData:i.fieldData})),
        beschikbaar_raw:(bData.items||[]).map(i=>({id:i.id,fieldData:i.fieldData})),
      }, { headers: NO_CACHE });
    } catch(e) { return Response.json({ error: e.message }, { status:500, headers: NO_CACHE }); }
  }

  if (!token) return Response.json({ ...FALLBACK }, { headers: NO_CACHE });

  try {
    const [dData, oData, bData] = await Promise.all([
      haalOp(COLLECTIE_DIENSTEN,    token),
      haalOp(COLLECTIE_OPTIES,      token),
      haalOp(COLLECTIE_BESCHIKBAAR, token),
    ]);
    const diensten    = parseDiensten(dData.items   || []);
    const opties      = parseOpties(oData.items     || []);
    const beschikbaar = parseBeschikbaar(bData.items || []);
    return Response.json(
      {
        diensten:    diensten.length ? diensten    : FALLBACK.diensten,
        opties:      opties.length   ? opties      : FALLBACK.opties,
        beschikbaar,
        tijdblokken: VASTE_TIJDBLOKKEN,
      },
      { headers: NO_CACHE }
    );
  } catch(e) {
    return Response.json({ ...FALLBACK, _error: e.message }, { headers: NO_CACHE });
  }
}
