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
    <div className="auth-page">
      <p className="eyebrow">AJV Pay</p>
      <h1 className="brand-title">Admin plateforme</h1>
      <p className="subtitle">
        File d'attente centralisée des paiements manuels de tous les marchands connectés.
      </p>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="field">
          URL de l'API
          <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
        </label>
        <label className="field">
          Clé admin
          <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn-primary">
          Se connecter
        </button>
      </form>
      <div className="link-row">
        <button onClick={onBack} className="btn btn-ghost">
          ← Retour à l'espace marchand
        </button>
      </div>
    </div>
  );
}
