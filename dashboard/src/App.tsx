import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { LoginForm } from './LoginForm';
import { useCredentials } from './useCredentials';
import { AdminDashboard } from './AdminDashboard';
import { AdminLoginForm } from './AdminLoginForm';
import { useAdminCredentials } from './useAdminCredentials';

export default function App() {
  const { credentials, setCredentials, clearCredentials } = useCredentials();
  const { adminCredentials, setAdminCredentials, clearAdminCredentials } = useAdminCredentials();
  const [mode, setMode] = useState<'merchant' | 'admin'>(adminCredentials ? 'admin' : 'merchant');

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

  if (!credentials) {
    return <LoginForm onSubmit={setCredentials} onAdminClick={() => setMode('admin')} />;
  }

  return <Dashboard credentials={credentials} onLogout={clearCredentials} />;
}
