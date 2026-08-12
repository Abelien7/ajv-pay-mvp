import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../../dashboardApi';
import type { PaymentDto } from '../../types';
import { useMerchant } from '../MerchantContext';
import { PaymentsTable } from '../PaymentsTable';

const RECENT_COUNT = 5;
const POLL_INTERVAL_MS = 15_000;

export function Overview() {
  const { me } = useMerchant();
  const [recent, setRecent] = useState<PaymentDto[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    function load() {
      const seq = ++requestSeq.current;
      dashboardApi
        .listPayments(RECENT_COUNT, 0)
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setRecent(res.items);
          setTotal(res.total);
          setError(null);
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setError(err instanceof Error ? err.message : 'Erreur inconnue');
        });
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="stack">
      <h1 className="page-title">Vue d’ensemble</h1>

      {error && <p className="error-banner">Erreur : {error}</p>}

      <div className="stat-row">
        <div className="card stat-card">
          <div className="stat-label">Solde à reverser</div>
          <div className="stat-value">{me ? `${me.balance.toLocaleString('fr-FR')} XOF` : '…'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Statut du compte</div>
          <div className="stat-value">{me?.is_active ? 'Actif' : 'Inactif'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Paiements enregistrés</div>
          <div className="stat-value">{total ?? '…'}</div>
        </div>
      </div>

      <div className="card">
        <div className="dash-section-header">
          <h2 className="section-title">Paiements récents</h2>
          <Link to="/dashboard/transactions" className="btn-ghost">
            Voir tout →
          </Link>
        </div>
        <PaymentsTable payments={recent} onRefund={undefined} refundingId={null} />
      </div>
    </div>
  );
}
