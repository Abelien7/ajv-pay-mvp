-- Empêche une double livraison webhook marchand quand le process API
-- (livraison immédiate best-effort après chaque transition) et le process
-- Worker (@Cron toutes les 10s) traitent la même tentative en concurrence.
-- `claimed_at` sert de bail court (voir WebhooksService.processDue) : une
-- tentative déjà réclamée récemment est ignorée par un autre appelant tant
-- que le bail n'a pas expiré, même en cas de crash avant la mise à jour du
-- statut final.

ALTER TABLE webhook_attempts ADD COLUMN claimed_at TIMESTAMPTZ;
