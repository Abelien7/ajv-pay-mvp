import { FormEvent, useState } from 'react';
import { dashboardApi, DashboardApiError } from './dashboardApi';

export function LoginForm({
  onSuccess,
  onAdminClick,
}: {
  onSuccess: (session: { id: string; name: string }) => void;
  onAdminClick: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await dashboardApi.login(email, password);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof DashboardApiError && err.status === 401 ? 'E-mail ou mot de passe invalide.' : 'Connexion impossible pour le moment.');
    } finally {
      setLoading(false);
    }
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
        <h1>Dashboard marchand</h1>
        <p className="subtitle">Connecte-toi avec l'e-mail et le mot de passe de ton compte marchand.</p>
        {error && <p className="error-banner">{error}</p>}
        <form onSubmit={handleSubmit} className="form-stack">
          <label className="field">
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <div className="link-row">
          <button onClick={onAdminClick} className="btn btn-ghost">
            Vous êtes l'admin plateforme ? →
          </button>
        </div>
      </div>
    </div>
  );
}
