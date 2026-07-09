-- Authentification dédiée au dashboard marchand (login humain), séparée des
-- clés API d'intégration (api_key_hash/hmac_secret, test_api_key_hash/
-- test_hmac_secret) — voir SessionGuard vs ApiKeyGuard. Un marchand n'a
-- plus jamais besoin de voir son hmac_secret pour utiliser le dashboard.

CREATE TABLE merchant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchant_users_merchant ON merchant_users(merchant_id);

CREATE TRIGGER trg_merchant_users_updated_at
    BEFORE UPDATE ON merchant_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Jeton de session opaque, haché en SHA-256 avant stockage — même famille
-- que hashApiKey() déjà utilisé pour les clés API (le jeton en clair est
-- déjà aléatoire à 256 bits, un hash lent type bcrypt n'apporterait rien
-- ici et ralentirait chaque requête authentifiée). Révocation à la
-- déconnexion : simple DELETE, pas de blocklist JWT à gérer.
CREATE TABLE merchant_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_user_id UUID NOT NULL REFERENCES merchant_users(id),
    session_token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchant_sessions_user ON merchant_sessions(merchant_user_id);
CREATE INDEX idx_merchant_sessions_token_hash ON merchant_sessions(session_token_hash);
