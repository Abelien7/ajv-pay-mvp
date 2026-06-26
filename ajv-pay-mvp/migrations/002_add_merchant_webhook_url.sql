-- =========================================================
-- AJV PAY — MVP — Migration 002
-- Ajout de webhook_url sur merchants (nécessaire à l'envoi des
-- notifications sortantes — absent du schéma initial fourni).
-- =========================================================

ALTER TABLE merchants ADD COLUMN webhook_url TEXT;
