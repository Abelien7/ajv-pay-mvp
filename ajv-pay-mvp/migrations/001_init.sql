-- =========================================================
-- AJV PAY — MVP — Migration 001 : schéma initial
-- =========================================================
-- Renforcements ajoutés par rapport à la spec brute :
--   - CHECK constraints sur amount > 0, status, direction, account
--   - Trigger empêchant tout UPDATE/DELETE sur ledger_entries et payment_events
--     (append-only garanti au niveau base, pas seulement au niveau applicatif)
--   - Index supplémentaires utiles aux requêtes fréquentes (webhooks dus, idempotency)
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- 1.1 MERCHANTS
-- ---------------------------------------------------------
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    api_key_hash TEXT NOT NULL,
    hmac_secret TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_api_key_hash ON merchants(api_key_hash);

-- ---------------------------------------------------------
-- 1.2 PAYMENTS
-- ---------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),

    amount BIGINT NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'XOF',

    method TEXT NOT NULL CHECK (method IN ('flooz', 'moov')),

    phone_number TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'expired', 'refunded')),

    provider_reference TEXT,

    idempotency_key TEXT NOT NULL,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(merchant_id, idempotency_key)
);

CREATE INDEX idx_payments_merchant ON payments(merchant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_reference ON payments(provider_reference);

-- ---------------------------------------------------------
-- 1.3 PAYMENT EVENTS (audit trail immuable)
-- ---------------------------------------------------------
CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),

    event_type TEXT NOT NULL
        CHECK (event_type IN ('created', 'processing', 'succeeded', 'failed', 'expired', 'refunded')),

    payload JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_payment ON payment_events(payment_id);

-- ---------------------------------------------------------
-- 1.4 LEDGER ENTRIES (double entry, append-only)
-- ---------------------------------------------------------
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_id UUID REFERENCES payments(id),
    merchant_id UUID REFERENCES merchants(id),

    account TEXT NOT NULL
        CHECK (account IN ('ajv_cash', 'merchant_payable', 'provider_flooz', 'provider_moov', 'fees')),

    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),

    amount BIGINT NOT NULL CHECK (amount > 0),

    currency TEXT NOT NULL DEFAULT 'XOF',

    reference TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_payment ON ledger_entries(payment_id);
CREATE INDEX idx_ledger_merchant ON ledger_entries(merchant_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account);

-- ---------------------------------------------------------
-- 1.5 IDEMPOTENCY KEYS
-- ---------------------------------------------------------
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    merchant_id UUID NOT NULL REFERENCES merchants(id),

    idem_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,

    response JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(merchant_id, idem_key)
);

-- ---------------------------------------------------------
-- 1.6 WEBHOOK ATTEMPTS
-- ---------------------------------------------------------
CREATE TABLE webhook_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    merchant_id UUID NOT NULL REFERENCES merchants(id),
    payment_id UUID NOT NULL REFERENCES payments(id),

    url TEXT NOT NULL,
    payload JSONB NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),

    attempt_count INT NOT NULL DEFAULT 0,

    next_retry_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_due ON webhook_attempts(status, next_retry_at);
CREATE INDEX idx_webhook_payment ON webhook_attempts(payment_id);

-- =========================================================
-- 2. PROTECTION APPEND-ONLY (ledger_entries & payment_events)
-- =========================================================
-- Le code applicatif ne doit jamais UPDATE/DELETE ces tables,
-- mais on le garantit aussi au niveau base pour ne dépendre
-- d'aucune discipline de code future.

CREATE OR REPLACE FUNCTION forbid_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % operation is forbidden on table %',
        TG_TABLE_NAME, TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TRIGGER trg_payment_events_append_only
    BEFORE UPDATE OR DELETE ON payment_events
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

-- =========================================================
-- 3. updated_at automatique sur payments / merchants
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_merchants_updated_at
    BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
