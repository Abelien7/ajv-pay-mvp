-- Empêche un double remboursement réel côté provider en cas d'appels
-- concurrents à POST /payments/:id/refund (double-clic, retry réseau) :
-- avant tout appel provider, PaymentOrchestrator.refundPayment réclame ce
-- paiement de façon atomique (UPDATE conditionnel) — un seul appel
-- concurrent peut gagner la réclamation, le second échoue immédiatement
-- sans jamais appeler le provider.

ALTER TABLE payments ADD COLUMN refund_claimed_at TIMESTAMPTZ;
