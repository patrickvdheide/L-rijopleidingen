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
        consument: vindPrijs(f,
          "prijs-consument","prijs-particulier","prijs-cursist",
          "price-consumer","prijs-incl-btw","prijs-incl","prijs-bruto",
          "prijs","price"),
        zzp: vindPrijs(f,
          "prijs-zzp","prijs-instructeur","prijs-zelfstandige","prijs-per-slot",
          "price-zzp","price-instructor","prijs-excl-btw","prijs-per-slot",
          "prijs-netto","prijs-excl","prijs","price","prijs-per-slot"),
        bedrijf: vindPrijs(f,
          "prijs-bedrijf","prijs-rijschoolhouder","prijs-rijschool",
          "price-business","price-company","prijs-organisatie",
          "prijs-b2b","prijs","price"),
      },
      _velden: Object.keys(f),
    };
  });
}

function parseOpties(items) {
  return items.map(item => {
    const f = item.fieldData || {};
    return {
      id:    item.id,
      label: vind(f, "name","naam","label","titel") || "Optie",
      prijs: vindPrijs(f, "prijs","price","bedrag","kosten","prijs-per-slot"),
      info:  vind(f, "info","omschrijving","description","beschrijving") || "",
      verplichtConsument: !!(vind(f,
        "verplicht-consument","verplicht-particulier","verplicht-cursist","verplicht")),
      zichtbaarConsument:  vind(f,"zichtbaar-consument","zichtbaar-particulier","show-consumer")  ?? true,
      zichtbaarZzp:        vind(f,"zichtbaar-zzp","zichtbaar-instructeur","show-zzp")             ?? true,
      zichtbaarBedrijf:    vind(f,"zichtbaar-bedrijf","zichtbaar-rijschool","show-business")      ?? true,
      _velden: Object.keys(f),
    };
  });
}

function parseBeschikbaar(items) {
  const fd = items[0]?.fieldData || {};
  const tijdStr = vind(fd,"tijdsloten","time-slots","tijden","slots","uren")
    ?? "08:00,09:00,10:00,11:00,13:00,14:00,15:00,16:00,17:00";
  const dagStr = vind(fd,"weekdagen","werkdagen","beschikbare-dagen","days","dagen") ?? "1,2,3,4,5";
  const blokStr = vind(fd,"geblokkeerde-data","blocked-dates","uitzonderingen","geblokkeerd") ?? "";
  return {
    tijdsloten:       tijdStr.split(",").map(t=>t.trim()).filter(Boolean),
    weekdagen:        dagStr.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n)),
    geblokkeerdeData: blokStr.split(",").map(d=>d.trim()).filter(Boolean),
  };
}

// BTW types: "incl" = consument (incl. btw), "excl" = zzp/bedrijf (excl. btw)
function parseKlanttypes(items) {
  return items
    .map(item => {
      const f = item.fieldData || {};
      return {
        id:       vind(f, "slug","id","klanttype-id","identifier") || item.id,
        // prijsSleutel: interne key voor d.prijzen[] lookup
        // Auto-mapping op basis van bekende namen — geen Webflow aanpassing nodig
        get prijsSleutel() {
          const n = (vind(f,"naam","name","label") || "").toLowerCase();
          const s = (vind(f,"slug","id") || "").toLowerCase();
          const t = n + " " + s;
          if (/cursist|consument|particulier/.test(t)) return "consument";
          if (/instructeur|zzp|zelfstand/.test(t))     return "zzp";
          if (/rijschool|bedrijf|organisat/.test(t))   return "bedrijf";
          return "consument"; // fallback
        },
        label:    vind(f, "name","naam","label","titel") || "Klant",
        sub:      vind(f, "subtitel","sub","omschrijving","description","toelichting") || "",
        icoon:    vind(f, "icoon","icon","emoji","symbool") || "",
        kleur:    vind(f, "kleur","color","accentkleur") || "#0586f0",
        btw:      vind(f, "btw","btw-type","tax","belasting") || "excl",
        volgorde: Number(vind(f, "volgorde","order","sort","sortering") || 99),
        bedrijfsvelden: !!(vind(f, "bedrijfsvelden","show-company","toon-bedrijf","kvk")),
        kvkveld:        !!(vind(f, "kvkveld","show-kvk","toon-kvk","kvk-verplicht")),
        _velden: Object.keys(f),
      };
    })
    .sort((a, b) => a.volgorde - b.volgorde);
}

const FALLBACK_KLANTTYPES = [
  { id:"consument", label:"Cursist",         sub:"Particulier · incl. btw",   icoon:"🎓", kleur:"#0586f0", btw:"incl",  volgorde:1, bedrijfsvelden:false, kvkveld:false },
  { id:"zzp",       label:"Instructeur",     sub:"Zelfstandige · excl. btw",  icoon:"🏍️", kleur:"#16a34a", btw:"excl",  volgorde:2, bedrijfsvelden:true,  kvkveld:false },
  { id:"bedrijf",   label:"Rijschoolhouder", sub:"Organisatie · excl. btw",   icoon:"🏢", kleur:"#92400e", btw:"excl",  volgorde:3, bedrijfsvelden:true,  kvkveld:true  },
];

const FALLBACK = {
  diensten:    [{ id:"locatie", label:"Locatie", duur:"90 min", info:"CBR-gecertificeerde oefenlocatie", prijzen:{ consument:100, zzp:100, bedrijf:100 } }],
  opties:      [
    { id:"instructeur", label:"Met instructeur", prijs:90,  info:"Je oefent met een instructeur", verplichtConsument:true,  zichtbaarConsument:true, zichtbaarZzp:true, zichtbaarBedrijf:true },
    { id:"motor",       label:"Motor op locatie", prijs:100, info:"Gebruik van motor op locatie",  verplichtConsument:false, zichtbaarConsument:true, zichtbaarZzp:true, zichtbaarBedrijf:true },
  ],
  beschikbaar: { tijdsloten:["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00"], weekdagen:[1,2,3,4,5], geblokkeerdeData:[] },
  klanttypes: FALLBACK_KLANTTYPES,
};

export async function onRequest(context) {
  const { request, env } = context;
  const token = env.WEBFLOW_TOKEN;
  const url   = new URL(request.url);
  const NO_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

  // ── Debug endpoint: /api/cms-data?debug=1&key=WEBFLOW_TOKEN ──
  // Geeft ruwe Webflow veldnamen terug zodat je exact ziet hoe ze heten
  if (url.searchParams.get("debug") === "1") {
    const debugKey = url.searchParams.get("key");
    if (!debugKey || debugKey !== token) {
      return Response.json({ error: "Stuur ?debug=1&key=JOUW_WEBFLOW_TOKEN" }, { status: 403, headers: NO_CACHE });
    }
    try {
      const fetchList = [
        haalOp(COLLECTIE_DIENSTEN,    token),
        haalOp(COLLECTIE_OPTIES,      token),
        haalOp(COLLECTIE_BESCHIKBAAR, token),
      ];
      if (COLLECTIE_KLANTTYPES) fetchList.push(haalOp(COLLECTIE_KLANTTYPES, token));
      const [dData, oData, bData, ktData] = await Promise.all(fetchList);
      return Response.json({
        diensten_raw:     (dData.items||[]).map(i=>({ id:i.id, fieldData:i.fieldData })),
        opties_raw:       (oData.items||[]).map(i=>({ id:i.id, fieldData:i.fieldData })),
        beschikbaar_raw:  (bData.items||[]).map(i=>({ id:i.id, fieldData:i.fieldData })),
        klanttypes_raw:   ktData ? (ktData.items||[]).map(i=>({ id:i.id, fieldData:i.fieldData })) : "collectie-id-niet-ingesteld",
      }, { headers: NO_CACHE });
    } catch (err) {
      return Response.json({ error: err.message }, { status:500, headers: NO_CACHE });
    }
  }

  if (!token) return Response.json(FALLBACK, { headers: NO_CACHE });

  try {
    const fetchList = [
      haalOp(COLLECTIE_DIENSTEN,    token),
      haalOp(COLLECTIE_OPTIES,      token),
      haalOp(COLLECTIE_BESCHIKBAAR, token),
    ];
    if (COLLECTIE_KLANTTYPES) fetchList.push(haalOp(COLLECTIE_KLANTTYPES, token));
    const [dData, oData, bData, ktData] = await Promise.all(fetchList);

    const diensten    = parseDiensten(dData.items    || []);
    const opties      = parseOpties(oData.items      || []);
    const beschikbaar = parseBeschikbaar(bData.items || []);
    const klanttypes  = ktData
      ? (parseKlanttypes(ktData.items || []).length ? parseKlanttypes(ktData.items) : FALLBACK_KLANTTYPES)
      : FALLBACK_KLANTTYPES;

    return Response.json(
      {
        diensten:    diensten.length ? diensten    : FALLBACK.diensten,
        opties:      opties.length   ? opties      : FALLBACK.opties,
        beschikbaar,
        klanttypes,
      },
      { headers: NO_CACHE }
    );
  } catch (err) {
    return Response.json({ ...FALLBACK, _error: err.message }, { headers: NO_CACHE });
  }
}
