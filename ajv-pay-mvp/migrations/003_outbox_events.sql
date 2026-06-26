-- =========================================================
-- AJV PAY — MVP — Migration 003
-- Table outbox_events : formalise le pattern Outbox (ADR V3).
--
-- Différence avec payment_events :
--   - payment_events = audit trail immuable du cycle de vie d'un paiement
--     (jamais modifié, jamais consommé).
--   - outbox_events  = file d'événements À TRAITER (notification marchand,
--     futurs consommateurs). Le flag `processed` est mutable par nature
--     (c'est une file de travail, pas un registre comptable) — donc pas de
--     trigger append-only ici, contrairement à ledger_entries/payment_events.
-- =========================================================

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_type TEXT NOT NULL,
    -- payment.created | payment.processing | payment.succeeded |
    -- payment.failed | payment.expired | payment.refunded

    payment_id UUID REFERENCES payments(id),
    merchant_id UUID REFERENCES merchants(id),

    -- Snapshot complet nécessaire au traitement (ex: notification marchand),
    -- pour que le processor n'ait jamais besoin de relire `payments` —
    -- c'est ce qui rend la bascule vers une vraie queue (SNS/SQS) triviale :
    -- le "message" est déjà autoporteur.
    payload JSONB NOT NULL,

    processed BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unprocessed ON outbox_events(processed, created_at)
    WHERE processed = FALSE;
CREATE INDEX idx_outbox_payment ON outbox_events(payment_id);
