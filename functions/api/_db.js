// functions/api/_db.js
// Gedeelde D1 database helpers — vervangt alle Airtable fetch calls

// ── BOEKINGEN ──

export async function getBoeking(db, boekingsnummer) {
  return db.prepare("SELECT * FROM boekingen WHERE boekingsnummer = ? LIMIT 1")
    .bind(boekingsnummer).first();
}

export async function getBoekingById(db, id) {
  return db.prepare("SELECT * FROM boekingen WHERE id = ? LIMIT 1")
    .bind(id).first();
}

export async function getAlleBoekingen(db, { vandaagEnLater = false } = {}) {
  if (vandaagEnLater) {
    const vandaag = new Date().toISOString().slice(0, 10);
    const { results } = await db.prepare(
      "SELECT * FROM boekingen WHERE datum >= ? ORDER BY datum ASC, tijdsloten ASC"
    ).bind(vandaag).all();
    return results;
  }
  const { results } = await db.prepare(
    "SELECT * FROM boekingen ORDER BY aangemaakt DESC"
  ).all();
  return results;
}

export async function maakBoeking(db, velden) {
  return db.prepare(`
    INSERT INTO boekingen
      (boekingsnummer, naam, email, telefoon, klanttype, datum, tijdsloten,
       diensten, opties, betaalmethode, totaal, bedrijfsnaam, kvk,
       straat, huisnummer, postcode, plaats, adres, status, aangemaakt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    velden.boekingsnummer,
    velden.naam        || "",
    velden.email       || "",
    velden.telefoon    || null,
    velden.klanttype   || "",
    velden.datum       || "",
    velden.tijdsloten  || "",
    velden.diensten    || "",
    velden.opties      || null,
    velden.betaalmethode || "contant",
    velden.totaal      || 0,
    velden.bedrijfsnaam || null,
    velden.kvk         || null,
    velden.straat      || null,
    velden.huisnummer  || null,
    velden.postcode    || null,
    velden.plaats      || null,
    velden.adres       || null,
    velden.status      || "Actief",
    new Date().toISOString(),
  ).run();
}

export async function updateBoeking(db, boekingsnummer, velden) {
  const sets   = Object.keys(velden).map(k => `${k} = ?`).join(", ");
  const waarden = Object.values(velden);
  return db.prepare(`UPDATE boekingen SET ${sets} WHERE boekingsnummer = ?`)
    .bind(...waarden, boekingsnummer).run();
}

export async function verwijderBoeking(db, boekingsnummer) {
  return db.prepare("DELETE FROM boekingen WHERE boekingsnummer = ?")
    .bind(boekingsnummer).run();
}

// Volgnummer voor boekingsnummer (YYYYMMDDNN)
export async function volgendBoekingsnummer(db, datum) {
  const prefix = datum.replace(/-/g, "");
  const rij = await db.prepare(
    "SELECT boekingsnummer FROM boekingen WHERE boekingsnummer LIKE ? ORDER BY boekingsnummer DESC LIMIT 1"
  ).bind(prefix + "%").first();
  if (!rij) return prefix + "01";
  const match = String(rij.boekingsnummer).match(/\d{2}$/);
  const volgend = match ? parseInt(match[0]) + 1 : 1;
  return prefix + String(volgend).padStart(2, "0");
}

// ── ADMINS ──

export async function getAdmin(db, gebruikersnaam) {
  return db.prepare("SELECT * FROM admins WHERE gebruikersnaam = ? LIMIT 1")
    .bind(gebruikersnaam).first();
}

export async function getAdminByEmail(db, email) {
  return db.prepare("SELECT * FROM admins WHERE email = ? LIMIT 1")
    .bind(email).first();
}

export async function getAdminByResetToken(db, token) {
  return db.prepare(
    "SELECT * FROM admins WHERE reset_token = ? AND reset_verloopt > ? LIMIT 1"
  ).bind(token, new Date().toISOString()).first();
}

export async function getAlleAdmins(db) {
  const { results } = await db.prepare(
    "SELECT id, gebruikersnaam, email, wachtwoord_hash, reset_token, aangemaakt FROM admins ORDER BY aangemaakt ASC"
  ).all();
  return results;
}

export async function maakAdmin(db, gebruikersnaam, email) {
  return db.prepare(
    "INSERT INTO admins (gebruikersnaam, email) VALUES (?, ?)"
  ).bind(gebruikersnaam, email).run();
}

export async function updateAdmin(db, gebruikersnaam, velden) {
  const kolommen = {
    wachtwoord_hash: velden.WachtwoordHash,
    reset_token:     velden.ResetToken,
    reset_verloopt:  velden.ResetVerloopt,
  };
  const te_zetten = Object.entries(kolommen).filter(([, v]) => v !== undefined);
  if (!te_zetten.length) return;
  const sets    = te_zetten.map(([k]) => `${k} = ?`).join(", ");
  const waarden = te_zetten.map(([, v]) => v);
  return db.prepare(`UPDATE admins SET ${sets} WHERE gebruikersnaam = ?`)
    .bind(...waarden, gebruikersnaam).run();
}

export async function verwijderAdmin(db, id) {
  return db.prepare("DELETE FROM admins WHERE id = ?").bind(id).run();
}
