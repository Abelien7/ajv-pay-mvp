-- Réintroduit 'cinetpay' comme moyen de paiement (retiré en 007) : cette
-- fois pour les cartes bancaires (Visa/Mastercard) via l'agrégateur
-- CinetPay, en redirection (channels=CREDIT_CARD) — pas du mobile money
-- redondant avec moov/mixx déjà en place.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('moov', 'mixx', 'manual', 'cinetpay'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_account_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_account_check
    CHECK (account IN ('ajv_cash', 'merchant_payable', 'provider_moov', 'provider_mixx', 'provider_manual', 'provider_cinetpay', 'fees'));
