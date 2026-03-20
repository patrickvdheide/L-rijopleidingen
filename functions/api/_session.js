// functions/api/_session.js
// Gedeelde sessie-verificatie via Authorization header
// Gebruik: import { verifieersessie } from "./_session.js";

const TABEL_ADMINS = "tblxPXaRSgAHiiauP";

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const la = a.length, lb = b.length;
  let diff = la ^ lb;
  const len = Math.max(la, lb);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i % la) || 0) ^ (b.charCodeAt(i % lb) || 0);
  return diff === 0 && la === lb;
}

// Leest sessie-token uit Authorization header: "Bearer TOKEN:USERNAME"
export function leesSessionHeader(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { token: null, user: null };
  const payload = authHeader.slice(7); // na "Bearer "
  const sep = payload.indexOf(":");
  if (sep === -1) return { token: null, user: null };
  return {
    token: payload.slice(0, sep),
    user:  payload.slice(sep + 1),
  };
}

export async function verifieersessie(request, atToken) {
  const { token, user } = leesSessionHeader(request);
  if (!token || !user) return false;

  const formule = encodeURIComponent(`{Gebruikersnaam}="${user}"`);
  const res = await fetch(
    `https://api.airtable.com/v0/appchbjgwoZQiQjfv/${TABEL_ADMINS}?filterByFormula=${formule}`,
    { headers: { Authorization: `Bearer ${atToken}` } }
  ).catch(() => null);

  if (!res?.ok) return false;
  const data = await res.json();
  const rec  = data.records?.[0];
  if (!rec) return false;

  const opgeslagen = rec.fields?.ResetToken || "";
  const verloopt   = rec.fields?.ResetVerloopt;
  const ok = opgeslagen.startsWith("sessie_") && timingSafeEqual(opgeslagen, "sessie_" + token);
  if (!ok || new Date(verloopt) < new Date()) return false;
  return true;
}
