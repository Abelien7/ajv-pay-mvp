import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MerchantProvider } from './MerchantContext';
import { DashboardShell } from './DashboardShell';
import { Overview } from './pages/Overview';
import { Transactions } from './pages/Transactions';
import { Settings } from './pages/Settings';

/**
 * Router local à ce sous-arbre uniquement : App.tsx pilote landing/login/
 * signup/admin par état React pur (pas d'URL dédiée), donc DashboardApp est
 * le seul et unique arbre monté à la fois qu'un <BrowserRouter> a besoin de
 * couvrir ici — pas de conflit possible avec un second routeur ailleurs.
 * Le catch-all "*" existe parce que l'URL du navigateur à l'instant où le
 * marchand se connecte peut être n'importe quoi (le mode landing/login
 * n'a jamais changé l'URL) — on atterrit toujours sur /dashboard.
 */
export function DashboardApp({ onLogout }: { onLogout: () => void }) {
  return (
    <BrowserRouter>
      <MerchantProvider>
        <Routes>
          <Route element={<DashboardShell onLogout={onLogout} />}>
            <Route path="/dashboard" element={<Overview />} />
            <Route path="/dashboard/transactions" element={<Transactions />} />
            <Route path="/dashboard/parametres" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MerchantProvider>
    </BrowserRouter>
  );
}
