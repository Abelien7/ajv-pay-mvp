-- Contenu du site vitrine, géré par le superadmin (même clé que la revue
-- des paiements manuels, voir AdminApiKeyGuard) — sans jamais nécessiter un
-- redéploiement pour ajouter une actualité, un pays ou un réseau.

CREATE TABLE news_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_news_posts_published ON news_posts(is_published, published_at DESC);
CREATE TRIGGER trg_news_posts_updated_at
    BEFORE UPDATE ON news_posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE covered_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_covered_countries_active ON covered_countries(is_active, display_order);

CREATE TABLE payment_networks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payment_networks_active ON payment_networks(is_active, display_order);

-- État réel du jour de cette migration — rien d'inventé. Le superadmin
-- ajoute la suite lui-même au fur et à mesure des partenariats réellement signés.
INSERT INTO covered_countries (name, is_active, display_order) VALUES ('Togo', TRUE, 0);
INSERT INTO payment_networks (name, is_active, display_order) VALUES
    ('Moov Money', TRUE, 0),
    ('Mixx by Yas', TRUE, 1);
