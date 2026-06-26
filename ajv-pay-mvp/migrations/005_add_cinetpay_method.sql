-- Élargit le moyen de paiement accepté à 'cinetpay' (carte bancaire +
-- mobile money multi-opérateurs via l'agrégateur CinetPay), en plus de
-- 'flooz' et 'moov'. Le nom de contrainte auto-généré par PostgreSQL pour un
-- CHECK inline déclaré dans le CREATE TABLE (migrations/001_init.sql) suit
-- la convention <table>_<colonne>_check.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('flooz', 'moov', 'cinetpay'));

-- Idem pour le compte ledger dédié au nouveau provider (provider_cinetpay).
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_account_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_account_check
    CHECK (account IN ('ajv_cash', 'merchant_payable', 'provider_flooz', 'provider_moov', 'provider_cinetpay', 'fees'));
