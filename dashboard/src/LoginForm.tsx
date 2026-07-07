import { FormEvent, useState } from 'react';
import type { Credentials } from './types';

export function LoginForm({
  onSubmit,
  onAdminClick,
}: {
  onSubmit: (creds: Credentials) => void;
  onAdminClick: () => void;
}) {
  const [apiBaseUrl, setApiBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ apiBaseUrl, apiKey, hmacSecret });
  }

  return (
    <div className="auth-page">
      <p className="eyebrow">AJV Pay</p>
      <h1 className="brand-title">Dashboard marchand</h1>
      <p className="subtitle">
        Connecte-toi avec les identifiants reçus à la création de ton compte marchand (
        <code>scripts/create-merchant.js</code>).
      </p>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="field">
          URL de l'API
          <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
        </label>
        <label className="field">
          API Key
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
        </label>
        <label className="field">
          HMAC Secret
          <input
            type="password"
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary">
          Se connecter
        </button>
      </form>
      <div className="link-row">
        <button onClick={onAdminClick} className="btn btn-ghost">
          Vous êtes l'admin plateforme ? →
        </button>
      </div>
    </div>
  );
}
