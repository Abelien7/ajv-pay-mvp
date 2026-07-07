import { CSSProperties, FormEvent, useState } from 'react';
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
    <div style={{ maxWidth: 420, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>AJV Pay — Admin plateforme</h1>
      <p style={{ color: '#555', fontSize: 14 }}>
        File d'attente centralisée des paiements manuels de tous les marchands connectés.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          URL de l'API
          <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} style={inputStyle} />
        </label>
        <label>
          Clé admin
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={inputStyle}
            required
          />
        </label>
        <button type="submit" style={{ padding: '10px 16px', cursor: 'pointer' }}>
          Se connecter
        </button>
      </form>
      <button
        onClick={onBack}
        style={{ marginTop: 16, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
      >
        ← Retour à l'espace marchand
      </button>
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
