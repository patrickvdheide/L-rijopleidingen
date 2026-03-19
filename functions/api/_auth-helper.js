// functions/api/_auth-helper.js
// Gedeelde verificatie-logica — geen HTTP aanroep nodig

const BASE  = "appchbjgwoZQiQjfv";
const TABEL = "tblxPXaRSgAHiiauP";

export async function verifieerSessie(token, gebruikersnaam, atToken) {
  if (!token || !gebruikersnaam) return false;
  try {
    const formule = encodeURIComponent(`{Gebruikersnaam}="${gebruikersnaam}"`);
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABEL}?filterByFormula=${formule}`, {
      headers: { Authorization: `Bearer ${atToken}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    const admin = data.records?.[0];
    if (!admin) return false;
    const opgeslagen = admin.fields.ResetToken;
    const verloopt   = admin.fields.ResetVerloopt;
    if (!opgeslagen || opgeslagen !== "sessie_" + token) return false;
    if (new Date(verloopt) < new Date()) return false;
    return true;
  } catch { return false; }
}
