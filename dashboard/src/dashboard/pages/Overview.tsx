import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../../dashboardApi';
import type { PaymentDto } from '../../types';
import { useMerchant } from '../MerchantContext';
import { PaymentsTable } from '../PaymentsTable';

const RECENT_COUNT = 5;

export function Overview() {
  const { me } = useMerchant();
  const [recent, setRecent] = useState<PaymentDto[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi
      .listPayments(RECENT_COUNT, 0)
      .then((res) => {
        setRecent(res.items);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue'));
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
