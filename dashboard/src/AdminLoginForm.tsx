import { FormEvent, useState } from 'react';
import type { AdminCredentials } from './types';

export function AdminLoginForm({
  onSubmit,
  onBack,
}: {
  onSubmit: (creds: AdminCredentials) => void;
  onBack: () => void;
}) {
  const [apiBaseUrl, setApiBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000');
  const [adminKey, setAdminKey] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ apiBaseUrl, adminKey });
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
        <h1>Admin plateforme</h1>
        <p className="subtitle">
          File d'attente centralisée des paiements manuels de tous les marchands connectés.
        </p>
        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            URL de l'API
            <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} required />
          </label>
          <label className="field">
            Clé admin
            <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required autoFocus />
          </label>
          <button type="submit" className="btn btn-primary btn-block">
            Se connecter
          </button>
        </form>
        <div className="link-row">
          <button onClick={onBack} className="btn btn-ghost">
            ← Retour à l'espace marchand
          </button>
        </div>
      </div>
    </div>
  );
}
