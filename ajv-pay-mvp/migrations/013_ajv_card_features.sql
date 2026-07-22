-- Contenu de la section "AJV Card" de la vitrine (vision carte bancaire),
-- géré par le superadmin comme le reste du contenu du site (voir 011_site_content.sql).

CREATE TABLE ajv_card_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ajv_card_features_active ON ajv_card_features(is_active, display_order);
CREATE TRIGGER trg_ajv_card_features_updated_at
    BEFORE UPDATE ON ajv_card_features
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reprend exactement les 3 cartes déjà écrites en dur dans Landing.tsx —
-- le superadmin les modifie désormais lui-même, rien n'est inventé de plus.
INSERT INTO ajv_card_features (title, body, is_active, display_order) VALUES
    ('Adossée à votre mobile money',
     'Une carte reliée directement à Moov Money, Mixx by Yas et aux autres portefeuilles mobile money de la région — pas besoin d''être déjà bancarisé pour en profiter.',
     TRUE, 0),
    ('Des frais pensés pour rester en Afrique',
     'L''objectif : des commissions nettement plus basses que les réseaux internationaux, pour que la valeur créée reste chez les commerçants et les banques de la région.',
     TRUE, 1),
    ('Construite avec de vraies banques partenaires',
     'En dialogue avec des banques et institutions de l''UEMOA pour une émission conforme aux règles de la BCEAO, étape par étape.',
     TRUE, 2);
