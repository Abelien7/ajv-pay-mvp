import { CSSProperties, FormEvent, useState } from 'react';
import type { Credentials } from './types';

export function LoginForm({ onSubmit }: { onSubmit: (creds: Credentials) => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000');
  const [apiKey, setApiKey] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ apiBaseUrl, apiKey, hmacSecret });
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>AJV Pay — Dashboard marchand</h1>
      <p style={{ color: '#555', fontSize: 14 }}>
        Connecte-toi avec les identifiants reçus à la création de ton compte
        marchand (<code>scripts/create-merchant.js</code>).
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          URL de l'API
          <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} style={inputStyle} />
        </label>
        <label>
          API Key
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={inputStyle} required />
        </label>
        <label>
          HMAC Secret
          <input
            type="password"
            value={hmacSecret}
            onChange={(e) => setHmacSecret(e.target.value)}
            style={inputStyle}
            required
          />
        </label>
        <button type="submit" style={{ padding: '10px 16px', cursor: 'pointer' }}>
          Se connecter
        </button>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 8,
  marginTop: 4,
  boxSizing: 'border-box',
};
