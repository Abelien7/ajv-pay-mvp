import { useState } from 'react';
import type { Credentials } from './types';

const STORAGE_KEY = 'ajvpay_dashboard_credentials';

export function useCredentials() {
  const [credentials, setCredentialsState] = useState<Credentials | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  });

  function setCredentials(creds: Credentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    setCredentialsState(creds);
  }

  function clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
    setCredentialsState(null);
  }

  return { credentials, setCredentials, clearCredentials };
}
