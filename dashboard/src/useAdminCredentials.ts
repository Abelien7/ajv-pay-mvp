import { useState } from 'react';
import type { AdminCredentials } from './types';

const STORAGE_KEY = 'ajvpay_dashboard_admin_credentials';

export function useAdminCredentials() {
  const [adminCredentials, setAdminCredentialsState] = useState<AdminCredentials | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdminCredentials) : null;
  });

  function setAdminCredentials(creds: AdminCredentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    setAdminCredentialsState(creds);
  }

  function clearAdminCredentials() {
    localStorage.removeItem(STORAGE_KEY);
    setAdminCredentialsState(null);
  }

  return { adminCredentials, setAdminCredentials, clearAdminCredentials };
}
