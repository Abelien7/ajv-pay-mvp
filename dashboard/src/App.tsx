import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { useSession } from './useSession';
import { AdminDashboard } from './AdminDashboard';
import { AdminLoginForm } from './AdminLoginForm';
import { useAdminCredentials } from './useAdminCredentials';

export default function App() {
  const { session, checking, setSession, clearSession } = useSession();
  const { adminCredentials, setAdminCredentials, clearAdminCredentials } = useAdminCredentials();
  const [mode, setMode] = useState<'merchant' | 'admin' | 'signup'>(adminCredentials ? 'admin' : 'merchant');

  if (mode === 'admin') {
    if (!adminCredentials) {
      return <AdminLoginForm onSubmit={setAdminCredentials} onBack={() => setMode('merchant')} />;
    }
    return (
      <AdminDashboard
        credentials={adminCredentials}
        onLogout={() => {
          clearAdminCredentials();
          setMode('merchant');
        }}
      />
    );
  }

  if (mode === 'signup') {
    return <SignupForm onDone={() => setMode('merchant')} />;
  }

  if (checking) {
    return null; // évite un flash du formulaire de connexion pendant la vérification de session
  }

  if (!session) {
    return (
      <LoginForm
        onSuccess={setSession}
        onAdminClick={() => setMode('admin')}
        onSignupClick={() => setMode('signup')}
      />
    );
  }

  return <Dashboard onLogout={clearSession} />;
}
