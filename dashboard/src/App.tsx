import { Dashboard } from './Dashboard';
import { LoginForm } from './LoginForm';
import { useCredentials } from './useCredentials';

export default function App() {
  const { credentials, setCredentials, clearCredentials } = useCredentials();

  if (!credentials) {
    return <LoginForm onSubmit={setCredentials} />;
  }

  return <Dashboard credentials={credentials} onLogout={clearCredentials} />;
}
