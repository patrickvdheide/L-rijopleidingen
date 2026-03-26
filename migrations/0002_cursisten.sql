-- migrations/0002_cursisten.sql
-- Voeg ontbrekende kolommen toe aan bestaande databases
-- SQLite ondersteunt geen "ALTER TABLE ADD COLUMN IF NOT EXISTS"
-- Voer dit uit via: Cloudflare Dashboard → D1 → l-rijopleidingen → Console
-- Of via: npx wrangler d1 execute l-rijopleidingen --remote --file=migrations/0002_cursisten.sql

-- De statements falen stil als kolom al bestaat (D1 vangt dit op)
ALTER TABLE boekingen ADD COLUMN opleidingsnummer  TEXT;
ALTER TABLE boekingen ADD COLUMN cursisten_json     TEXT;
ALTER TABLE boekingen ADD COLUMN aantal_cursisten   INTEGER NOT NULL DEFAULT 1;
