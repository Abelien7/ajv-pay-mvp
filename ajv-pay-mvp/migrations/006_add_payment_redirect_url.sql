-- Les providers à redirection (CinetPay : carte bancaire + mobile money
-- multi-opérateurs) renvoient une URL de paiement vers laquelle le client
-- doit être redirigé pour finaliser sa transaction. Flooz/Moov (push USSD
-- direct) n'utilisent jamais cette colonne — elle reste NULL pour eux.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS redirect_url TEXT;
