import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { dashboardApi } from '../dashboardApi';
import type { MerchantMeResponse } from '../types';

interface MerchantContextValue {
  me: MerchantMeResponse | null;
  loading: boolean;
  error: string | null;
  /**
   * N'échoue jamais (voir implémentation) — un appelant qui vient de
   * réussir une autre action (ex: enregistrer l'URL de webhook) ne doit
   * jamais voir CETTE simple actualisation en arrière-plan transformer son
   * succès en message d'erreur.
   */
  reload: () => Promise<void>;
}

const MerchantContext = createContext<MerchantContextValue | null>(null);

/**
 * Chargé une seule fois ici (pas par page) : la barre latérale et l'en-tête
 * ont besoin du nom/solde du marchand sur TOUTES les pages du dashboard, pas
 * seulement l'accueil. Rafraîchi périodiquement (comme l'ancien Dashboard.tsx
 * le faisait) pour que le solde reste à jour sans rechargement manuel.
 */
export function MerchantProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MerchantMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await dashboardApi.getMe();
      setMe(response);
      setError(null);
    } catch (err) {
      // Ne PAS laisser `loading` bloqué à true indéfiniment (sidebar/topbar
      // coincés sur "…" pour toujours) ni faire planter un appelant qui
      // enchaîne reload() après une action déjà réussie — l'erreur est
      // exposée via le contexte, à charge du consommateur de l'afficher.
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 15_000);
    return () => clearInterval(interval);
  }, [reload]);

  return <MerchantContext.Provider value={{ me, loading, error, reload }}>{children}</MerchantContext.Provider>;
}

export function useMerchant(): MerchantContextValue {
  const ctx = useContext(MerchantContext);
  if (!ctx) throw new Error('useMerchant doit être utilisé à l’intérieur de <MerchantProvider>');
  return ctx;
}
