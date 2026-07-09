import { FormEvent, useState } from 'react';
import { dashboardApi, DashboardApiError } from './dashboardApi';
import type { RegisterMerchantResponse } from './types';

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <label className="field">
      {label}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={value} readOnly style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
        <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>
    </label>
  );
}

export function SignupForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterMerchantResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.register(name, email, password, webhookUrl || undefined);
      setResult(res);
    } catch (err) {
      if (err instanceof DashboardApiError && err.status === 409) {
        setError('Un compte existe déjà avec cet e-mail.');
      } else {
        setError("Inscription impossible pour le moment.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 460 }}>
          <div className="auth-mark">
            <div className="auth-mark-glyph">AP</div>
            <div className="auth-mark-text">
              AJV <span>Pay</span>
            </div>
          </div>
          <h1>Compte créé, {result.name} !</h1>
          <p className="subtitle">{result._notice}</p>
          <div className="form-stack">
            <CopyableField label="Clé API test (à utiliser en premier)" value={result.test_api_key} />
            <CopyableField label="Secret HMAC test" value={result.test_hmac_secret} />
            <CopyableField label="Clé API live" value={result.live_api_key} />
            <CopyableField label="Secret HMAC live" value={result.live_hmac_secret} />
          </div>
          <div className="link-row">
            <button onClick={onDone} className="btn btn-primary">
              Aller à la connexion
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark">
          <div className="auth-mark-glyph">AP</div>
          <div className="auth-mark-text">
            AJV <span>Pay</span>
          </div>
        </div>
        <h1>Créer un compte marchand</h1>
        <p className="subtitle">
          Intègre et teste avec ta clé "test" — aucun impact financier, résolution instantanée.
        </p>
        {error && <p className="error-banner">{error}</p>}
        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            Nom du commerce
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="field">
            URL de webhook (optionnel)
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://votre-site.com/webhooks/ajvpay"
            />
          </label>
          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        <div className="link-row">
          <button onClick={onDone} className="btn btn-ghost">
            ← J'ai déjà un compte
          </button>
        </div>
      </div>
    </div>
  );
}
