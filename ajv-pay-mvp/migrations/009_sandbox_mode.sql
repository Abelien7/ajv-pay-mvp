-- Mode test/sandbox (inspiré du modèle Stripe : un seul compte marchand,
-- deux paires de clés). Objectif : un futur marchand peut intégrer et
-- tester AJV Pay sans jamais toucher de vrai argent ni de vraie
-- comptabilité, avant de basculer en clé "live".

-- ---------------------------------------------------------
-- 1. Deuxième paire de clés par marchand (clé "test", à côté de la clé
--    "live" existante — api_key_hash/hmac_secret ne changent pas de sens,
--    pour ne rien casser côté marchands déjà intégrés).
-- ---------------------------------------------------------
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_api_key_hash TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS test_hmac_secret TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_test_api_key_hash ON merchants(test_api_key_hash);

-- ---------------------------------------------------------
-- 2. `mode` sur payments et idempotency_keys : un paiement test et un
--    paiement live du même marchand vivent dans des univers séparés, comme
--    chez Stripe — y compris pour l'unicité de l'Idempotency-Key (un
--    marchand peut réutiliser la même clé en test et en live sans conflit).
-- ---------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live'
    CHECK (mode IN ('live', 'test'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_merchant_id_idempotency_key_key;
ALTER TABLE payments ADD CONSTRAINT payments_merchant_mode_idem_key_key
    UNIQUE (merchant_id, mode, idempotency_key);

ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live'
    CHECK (mode IN ('live', 'test'));

ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_merchant_id_idem_key_key;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_merchant_mode_idem_key_key
    UNIQUE (merchant_id, mode, idem_key);

CREATE INDEX IF NOT EXISTS idx_payments_mode ON payments(mode);
