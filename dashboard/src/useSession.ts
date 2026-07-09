import { useEffect, useState } from 'react';
import { dashboardApi } from './dashboardApi';

export interface DashboardSession {
  id: string;
  name: string;
}

/**
 * Le cookie de session (HttpOnly) est la seule source de vérité — jamais
 * lu ni stocké côté JS (impossible de toute façon, HttpOnly). Au
 * chargement, on demande simplement au serveur "suis-je connecté ?" via
 * GET /dashboard/me plutôt que de garder un état local qui pourrait
 * dériver du cookie réel (ex: cookie expiré mais état local encore "connecté").
 */
export function useSession() {
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    dashboardApi
      .getMe()
      .then((me) => setSession({ id: me.id, name: me.name }))
      .catch(() => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  function clearSession() {
    setSession(null);
  }

  return { session, checking, setSession, clearSession };
}
