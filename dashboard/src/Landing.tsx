import { useEffect, useState } from 'react';
import { siteContentApi } from './siteContentApi';
import type { CardFeature, ListItem, NewsPost } from './types';

const API_DOCS_URL = 'https://ajv-pay-mvp-production.up.railway.app/docs';

const METHOD_DESCRIPTIONS: Record<string, string> = {
  'Moov Money': 'Paiement mobile via Moov Africa.',
  'Mixx by Yas': 'Paiement mobile via Togocom.',
};

export function Landing({
  onSignupClick,
  onLoginClick,
}: {
  onSignupClick: () => void;
  onLoginClick: () => void;
}) {
  const [countries, setCountries] = useState<ListItem[]>([]);
  const [networks, setNetworks] = useState<ListItem[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [cardFeatures, setCardFeatures] = useState<CardFeature[]>([]);

  useEffect(() => {
    // siteContentApi gère déjà les réponses HTTP en erreur (retourne []) —
    // ce .catch() couvre seulement l'échec réseau bas niveau (hors-ligne,
    // DNS, CORS), pour ne pas laisser une promesse rejetée sans handler.
    siteContentApi.listCountries().then(setCountries).catch(() => {});
    siteContentApi.listNetworks().then(setNetworks).catch(() => {});
    siteContentApi.listNews().then(setNews).catch(() => {});
    siteContentApi.listCardFeatures().then(setCardFeatures).catch(() => {});
  }, []);

  const networkNames = networks.map((n) => n.name);
  const networksLabel =
    networkNames.length > 0 ? networkNames.join(' et ') : 'mobile money';
  const countriesLabel = countries.length > 0 ? countries.map((c) => c.name).join(', ') : 'Togo';

  return (
    <div>
      <nav className="site-nav">
        <div className="nav-brand">
          <div className="nav-brand-glyph">AP</div>
          <span className="nav-brand-text">
            AJV <span>Pay</span>
          </span>
        </div>
        <div className="nav-links">
          <a href="#comment-ca-marche">Comment ça marche</a>
          <a href="#securite">Sécurité</a>
          <a href="#ajv-card">AJV Card</a>
          <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
            Documentation API
          </a>
          <button onClick={onLoginClick} className="btn btn-ghost">
            Se connecter
          </button>
          <button onClick={onSignupClick} className="btn btn-primary btn-sm">
            Créer un compte
          </button>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow eyebrow-on-dark">Paiement mobile money — Afrique de l'Ouest</p>
        <h1>Encaissez {networksLabel} depuis votre site, en toute confiance.</h1>
        <p className="hero-sub">
          AJV Pay est l'intermédiaire qui connecte votre site aux paiements mobile money — vous
          intégrez une API, on s'occupe du reste : sécurité, comptabilité, notifications.
        </p>
        <div className="hero-actions">
          <button onClick={onSignupClick} className="btn btn-gold btn-lg">
            Créer mon compte marchand
          </button>
          <button onClick={onLoginClick} className="btn btn-outline-light btn-lg">
            Se connecter
          </button>
        </div>
      </section>

      <section className="proof-strip">
        <div className="proof-item">
          <div className="proof-value">{networks.length}</div>
          <div className="proof-label">Réseaux mobile money couverts</div>
        </div>
        <div className="proof-item">
          <div className="proof-value">100%</div>
          <div className="proof-label">Transactions tracées, jamais modifiables</div>
        </div>
        <div className="proof-item">
          <div className="proof-value">0 F</div>
          <div className="proof-label">Coût pour tester votre intégration</div>
        </div>
        <div className="proof-item">
          <div className="proof-value">Mavahi</div>
          <div className="proof-label">Premier commerce en production sur AJV Pay</div>
        </div>
      </section>

      <section id="comment-ca-marche" className="site-section">
        <h2 className="section-heading">Comment ça marche</h2>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-num">1</div>
            <h3>Inscrivez votre commerce</h3>
            <p>Créez votre compte en quelques secondes — nom, e-mail, mot de passe. Aucune paperasse à envoyer pour démarrer.</p>
          </div>
          <div className="step-card">
            <div className="step-num">2</div>
            <h3>Testez sans risque</h3>
            <p>Une clé "test" vous est fournie d'office : intégrez et validez votre parcours de paiement sans jamais toucher de vrai argent.</p>
          </div>
          <div className="step-card">
            <div className="step-num">3</div>
            <h3>Passez en direct</h3>
            <p>Une fois prêt, basculez vers vos clés "live" — même code, mêmes routes, vos clients paient pour de vrai.</p>
          </div>
        </div>
      </section>

      <section className="site-section site-section-alt">
        <h2 className="section-heading">Moyens de paiement acceptés par vos clients</h2>
        <div className="methods-grid">
          {networks.map((network) => (
            <div key={network.id} className="method-card">
              <div className="method-name">{network.name}</div>
              <p>{METHOD_DESCRIPTIONS[network.name] ?? 'Paiement mobile money.'}</p>
            </div>
          ))}
          <div className="method-card">
            <div className="method-name">Vérification manuelle</div>
            <p>Le client envoie l'argent lui-même, confirmé sous supervision AJV Pay — fonctionne dès aujourd'hui, sans attendre d'intégration réseau.</p>
          </div>
        </div>
      </section>

      <section id="securite" className="site-section">
        <h2 className="section-heading">Pensé comme une vraie infrastructure de paiement</h2>
        <div className="trust-grid">
          <div className="trust-card">
            <h3>Comptabilité inviolable</h3>
            <p>Chaque paiement est enregistré de façon permanente — jamais modifiable ni supprimable après coup, même par erreur.</p>
          </div>
          <div className="trust-card">
            <h3>Mode test intégré</h3>
            <p>Intégrez et validez votre parcours de paiement de bout en bout avant de manipuler le moindre vrai centime.</p>
          </div>
          <div className="trust-card">
            <h3>Notifications fiables</h3>
            <p>Votre site est prévenu à chaque paiement, avec relance automatique en cas de souci réseau passager.</p>
          </div>
        </div>
      </section>

      <section id="ajv-card" className="site-section site-section-alt">
        <span className="eyebrow section-eyebrow-center">Vision 2027–2031</span>
        <h2 className="section-heading">Demain, une carte AJV Pay</h2>
        <p className="section-intro">
          Au-delà du mobile money, AJV Pay travaille à un réseau de cartes de paiement pensé pour
          l'Afrique de l'Ouest — pour que vos clients puissent payer par carte, au même endroit
          qu'ils gèrent déjà leur mobile money.
        </p>
        {cardFeatures.length === 0 ? (
          <p className="empty-state">Détails à venir.</p>
        ) : (
          <div className="trust-grid">
            {cardFeatures.map((feature) => (
              <div key={feature.id} className="trust-card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        )}
        <p className="section-note">
          Ce projet est en phase de construction et de dialogue réglementaire — aucune carte n'est
          disponible à ce jour.
        </p>
      </section>

      {news.length > 0 ? (
        <section className="site-section">
          <h2 className="section-heading">Actualités</h2>
          <div className="steps-grid">
            {news.map((post) => (
              <div key={post.id} className="step-card">
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    style={{ width: '100%', borderRadius: 8, marginBottom: 12 }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <h3>{post.title}</h3>
                <p>{post.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="client-teaser">
          <span className="eyebrow">Bientôt</span>
          <h2>Un espace client AJV Pay</h2>
          <p>Portefeuille, achat de crypto, et bien d'autres services pour vos clients — une nouvelle façon de gérer leur argent, à venir.</p>
        </section>
      )}

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-col footer-brand-col">
            <div className="nav-brand">
              <div className="nav-brand-glyph">AP</div>
              <span className="nav-brand-text">
                AJV <span>Pay</span>
              </span>
            </div>
            <p>Le paiement mobile money pour l'Afrique de l'Ouest, simple à intégrer.</p>
          </div>
          <div className="footer-col">
            <h4>Produit</h4>
            <a href="#comment-ca-marche">Comment ça marche</a>
            <a href="#securite">Sécurité</a>
            <a href="#ajv-card">AJV Card</a>
            <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
              Documentation API
            </a>
          </div>
          <div className="footer-col">
            <h4>Marchands</h4>
            <button onClick={onSignupClick} className="footer-link-btn">
              Créer un compte
            </button>
            <button onClick={onLoginClick} className="footer-link-btn">
              Se connecter
            </button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 AJV Global Holdings</span>
          <span>{countriesLabel}</span>
        </div>
      </footer>
    </div>
  );
}
