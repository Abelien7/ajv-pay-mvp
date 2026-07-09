import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { Landing } from './Landing';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { useSession } from './useSession';
import { AdminDashboard } from './AdminDashboard';
import { AdminLoginForm } from './AdminLoginForm';
import { useAdminCredentials } from './useAdminCredentials';

type Mode = 'landing' | 'login' | 'signup' | 'admin';

/**
 * Aucun lien public ne mène ici (voir Landing.tsx/LoginForm.tsx) — seul
 * l'utilisateur connaît cette URL directe. Ce n'est pas un vrai secret (une
 * URL reste visible dans l'historique du navigateur), la vraie protection
 * reste la clé admin ; ça retire juste le lien de l'interface publique.
 */
const isAdminPath = window.location.pathname === '/admin';

export default function App() {
  const { session, checking, setSession, clearSession } = useSession();
  const { adminCredentials, setAdminCredentials, clearAdminCredentials } = useAdminCredentials();
  const [mode, setMode] = useState<Mode>(adminCredentials || isAdminPath ? 'admin' : 'landing');

  if (mode === 'admin') {
    if (!adminCredentials) {
      return <AdminLoginForm onSubmit={setAdminCredentials} onBack={() => setMode('landing')} />;
    }
    return (
      <AdminDashboard
        credentials={adminCredentials}
        onLogout={() => {
          clearAdminCredentials();
          setMode('landing');
        }}
      />
    );
  }

  if (mode === 'signup') {
    return <SignupForm onDone={() => setMode('login')} />;
  }

  if (checking) {
    return null; // évite un flash de la page pendant la vérification de session
  }

  // Une session valide prime toujours sur le mode affiché — un marchand déjà
  // connecté (cookie encore valide) ne doit jamais retomber sur la vitrine
  // ou l'écran de connexion au rechargement de la page.
  if (session) {
    return (
      <Dashboard
        onLogout={() => {
          clearSession();
          setMode('login');
        }}
      />
    );
  }

  if (mode === 'login') {
    return <LoginForm onSuccess={setSession} onSignupClick={() => setMode('signup')} />;
  }

  return <Landing onSignupClick={() => setMode('signup')} onLoginClick={() => setMode('login')} />;
}
