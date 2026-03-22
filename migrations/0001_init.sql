-- migrations/0001_init.sql
-- L-Rijopleidingen boekingssysteem schema

CREATE TABLE IF NOT EXISTS boekingen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  boekingsnummer TEXT NOT NULL UNIQUE,
  naam         TEXT NOT NULL,
  email        TEXT NOT NULL,
  telefoon     TEXT,
  klanttype    TEXT NOT NULL,
  datum        TEXT NOT NULL,
  tijdsloten   TEXT NOT NULL,
  diensten     TEXT NOT NULL,
  opties       TEXT,
  betaalmethode TEXT NOT NULL,
  totaal       REAL NOT NULL DEFAULT 0,
  bedrijfsnaam TEXT,
  kvk          TEXT,
  straat       TEXT,
  huisnummer   TEXT,
  postcode     TEXT,
  plaats       TEXT,
  adres        TEXT,
  status       TEXT NOT NULL DEFAULT 'Actief',
  herinnerd    INTEGER NOT NULL DEFAULT 0,
  aangemaakt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_boekingen_datum      ON boekingen(datum);
CREATE INDEX IF NOT EXISTS idx_boekingen_email      ON boekingen(email);
CREATE INDEX IF NOT EXISTS idx_boekingen_status     ON boekingen(status);
CREATE INDEX IF NOT EXISTS idx_boekingen_nr         ON boekingen(boekingsnummer);

CREATE TABLE IF NOT EXISTS admins (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  gebruikersnaam  TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  wachtwoord_hash TEXT,
  reset_token     TEXT,
  reset_verloopt  TEXT,
  aangemaakt      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admins_gebruikersnaam ON admins(gebruikersnaam);
CREATE INDEX IF NOT EXISTS idx_admins_email          ON admins(email);
