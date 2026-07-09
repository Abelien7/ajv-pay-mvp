export function Landing({
  onSignupClick,
  onLoginClick,
  onAdminClick,
}: {
  onSignupClick: () => void;
  onLoginClick: () => void;
  onAdminClick: () => void;
}) {
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
        <h1>Encaissez Moov Money et Mixx by Yas depuis votre site, en toute confiance.</h1>
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
          <div className="method-card">
            <div className="method-name">Moov Money</div>
            <p>Paiement mobile via Moov Africa.</p>
          </div>
          <div className="method-card">
            <div className="method-name">Mixx by Yas</div>
            <p>Paiement mobile via Togocom.</p>
          </div>
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

      <section className="client-teaser">
        <span className="eyebrow">Bientôt</span>
        <h2>Un espace client AJV Pay</h2>
        <p>Portefeuille, achat de crypto, et bien d'autres services pour vos clients — une nouvelle façon de gérer leur argent, à venir.</p>
      </section>

      <footer className="site-footer">
        <span>AJV Pay — AJV Global Holdings</span>
        <button onClick={onAdminClick} className="btn btn-ghost btn-sm">
          Admin plateforme
        </button>
      </footer>
    </div>
  );
}
