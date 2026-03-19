// functions/api/_auth.js
// Gedeelde auth verificatie — wordt geimporteerd door andere functies

const BASE  = "appchbjgwoZQiQjfv";
const TABEL = "tblxPXaRSgAHiiauP";

export async function verifieerSessie(token, gebruikersnaam, atToken) {
  if (!token || !gebruikersnaam || !atToken) return false;

  try {
    const formule = encodeURIComponent(`{Gebruikersnaam}="${gebruikersnaam}"`);
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${TABEL}?filterByFormula=${formule}`,
      { headers: { Authorization: `Bearer ${atToken}` } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    const admin = data.records?.[0];
    if (!admin) return false;

    const opgeslagen = admin.fields?.ResetToken || "";
    const verloopt   = admin.fields?.ResetVerloopt || "";

    if (!opgeslagen.startsWith("sessie_" + token)) return false;
    if (new Date(verloopt) < new Date()) return false;

    return true;
  } catch {
    return false;
  }
}
