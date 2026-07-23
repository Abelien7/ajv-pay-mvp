-- Ajoute 'fedapay' comme moyen de paiement : agrégateur mobile money/carte
-- utilisé pour automatiser Moov Togo et Togocel (Mixx by Yas) via une page
-- de paiement hébergée, en complément de 'manual' (vérification humaine).
-- Voir FedaPayAdapter — provider secondaire, la vraie priorité reste
-- l'intégration API directe Moov/Mixx quand leurs identifiants marchands
-- seront obtenus (voir migrations/007_manual_payment_method.sql).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('moov', 'mixx', 'manual', 'cinetpay', 'fedapay'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_account_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_account_check
    CHECK (account IN ('ajv_cash', 'merchant_payable', 'provider_moov', 'provider_mixx', 'provider_manual', 'provider_cinetpay', 'provider_fedapay', 'fees'));
