import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Receipt, Settings, LogOut } from 'lucide-react';
import { dashboardApi } from '../dashboardApi';
import { useMerchant } from './MerchantContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/dashboard/transactions', label: 'Transactions', icon: Receipt, end: false },
  { to: '/dashboard/parametres', label: 'Paramètres', icon: Settings, end: false },
];

export function DashboardShell({ onLogout }: { onLogout: () => void }) {
  const { me, error } = useMerchant();

  // Doit invalider le cookie de session côté serveur (POST /dashboard/logout)
  // avant de nettoyer l'état local — sinon la session reste valide et
  // GET /dashboard/me reconnecte silencieusement au prochain chargement
  // (voir useSession.ts), sur un poste partagé notamment.
  async function handleLogout() {
    try {
      await dashboardApi.logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-sidebar-brand">
          <div className="auth-mark-glyph">AP</div>
          <span className="auth-mark-text">
            AJV <span>Pay</span>
          </span>
        </div>

        <div className="dash-sidebar-merchant">
          <div className="dash-sidebar-merchant-name">{me?.name ?? '…'}</div>
          <span className={`badge ${me?.is_active ? 'badge-succeeded' : 'badge-failed'}`}>
            {me?.is_active ? 'Compte actif' : 'Compte inactif'}
          </span>
        </div>

        <nav className="dash-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link-active' : ''}`}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button onClick={handleLogout} className="dash-nav-link dash-nav-logout">
          <LogOut size={17} />
          Déconnexion
        </button>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          {error && <p className="error-banner" style={{ marginBottom: 0, marginRight: 'auto' }}>Erreur : {error}</p>}
          <div className="dash-topbar-balance">
            <span className="stat-label">Solde à reverser</span>
            <span className="dash-topbar-balance-value">{me ? `${me.balance.toLocaleString('fr-FR')} XOF` : '…'}</span>
          </div>
        </header>
        <main className="dash-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
