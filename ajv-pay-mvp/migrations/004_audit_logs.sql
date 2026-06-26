-- Journal d'audit append-only : toute action sensible (création marchand,
-- transition de statut d'un paiement, remboursement, échec d'authentification
-- API) est enregistrée ici, indépendamment de payment_events (qui ne couvre
-- que le cycle de vie d'un paiement). Indispensable avant de traiter de
-- l'argent réel : c'est la trace qu'un auditeur ou un régulateur demandera.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('merchant', 'system', 'provider', 'admin')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at);

-- Append-only : comme ledger_entries/payment_events, aucune modification ou
-- suppression a posteriori n'est permise — un audit log corrigé n'est plus
-- un audit log.
CREATE OR REPLACE FUNCTION forbid_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est append-only : UPDATE/DELETE interdits (tentative sur id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forbid_audit_log_update ON audit_logs;
CREATE TRIGGER trg_forbid_audit_log_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_log_mutation();
