-- migrations/0002_cursisten.sql
-- Voeg opleidingsnummer en cursisten JSON toe aan boekingen tabel

ALTER TABLE boekingen ADD COLUMN opleidingsnummer TEXT;
ALTER TABLE boekingen ADD COLUMN cursisten_json    TEXT;
ALTER TABLE boekingen ADD COLUMN aantal_cursisten  INTEGER NOT NULL DEFAULT 1;
