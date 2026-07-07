-- Évolution des providers disponibles :
--   - Retrait de CinetPay (plus utilisé pour ce projet).
--   - Renommage 'flooz' -> 'mixx' : Flooz a été rebaptisé Moov Money (déjà
--     couvert par 'moov', inchangé) ; le second réseau disponible au Togo,
--     T-Money (Togocom), a lui été rebaptisé Mixx by Yas — d'où 'mixx'.
--   - Ajout de 'manual' : le client envoie l'argent lui-même vers un numéro
--     marchand fixe (mobile money) et soumet l'ID de transaction reçu ; un
--     admin AJV Pay vérifie et confirme depuis le dashboard. Utile tant que
--     Moov/Mixx n'ont pas remis leurs identifiants marchands API, et reste
--     une option permanente en secours.

-- Renomme les données existantes AVANT de resserrer les contraintes, pour
-- qu'aucune ligne existante ne viole le nouveau CHECK.
UPDATE payments SET method = 'mixx' WHERE method = 'flooz';
UPDATE ledger_entries SET account = 'provider_mixx' WHERE account = 'provider_flooz';

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('moov', 'mixx', 'manual'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_account_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_account_check
    CHECK (account IN ('ajv_cash', 'merchant_payable', 'provider_moov', 'provider_mixx', 'provider_manual', 'fees'));

-- Preuve soumise par le client (ID de transaction mobile money). Un paiement
-- 'manual' reste en 'processing' tant qu'aucune preuve n'a été validée par
-- un admin (voir ManualReviewController) — plusieurs soumissions possibles
-- pour un même paiement (ex: le client se trompe puis renvoie la bonne
-- référence), toutes conservées pour l'audit.
CREATE TABLE manual_payment_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    submitted_reference TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_manual_proofs_payment ON manual_payment_proofs(payment_id);
