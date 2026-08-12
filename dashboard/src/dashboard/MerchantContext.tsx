import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { dashboardApi } from '../dashboardApi';
import type { MerchantMeResponse } from '../types';

interface MerchantContextValue {
  me: MerchantMeResponse | null;
  loading: boolean;
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

  const reload = useCallback(async () => {
    const response = await dashboardApi.getMe();
    setMe(response);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 15_000);
    return () => clearInterval(interval);
  }, [reload]);

  return <MerchantContext.Provider value={{ me, loading, reload }}>{children}</MerchantContext.Provider>;
}

export function useMerchant(): MerchantContextValue {
  const ctx = useContext(MerchantContext);
  if (!ctx) throw new Error('useMerchant doit être utilisé à l’intérieur de <MerchantProvider>');
  return ctx;
}
