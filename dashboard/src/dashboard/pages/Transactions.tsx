import { useEffect, useState } from 'react';
import { dashboardApi } from '../../dashboardApi';
import type { PaymentDto } from '../../types';
import { PaymentsTable } from '../PaymentsTable';

const PAGE_SIZE = 20;

export function Transactions() {
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await dashboardApi.listPayments(PAGE_SIZE, offset);
      setPayments(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  async function handleRefund(paymentId: string) {
    if (!window.confirm('Confirmer le remboursement de ce paiement ?')) return;
    setRefundingId(paymentId);
    setError(null);
    setSuccess(null);
    try {
      await dashboardApi.refundPayment(paymentId);
      await load();
      setSuccess('Paiement remboursé avec succès.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du remboursement');
    } finally {
      setRefundingId(null);
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="stack">
      <h1 className="page-title">Transactions</h1>

      {error && <p className="error-banner">Erreur : {error}</p>}
      {success && <p className="success-banner">{success}</p>}

      <div className="card">
        {loading ? (
          <p className="empty-state">Chargement…</p>
        ) : (
          <>
            <PaymentsTable payments={payments} onRefund={handleRefund} refundingId={refundingId} />
            {total > PAGE_SIZE && (
              <div className="dash-pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  ← Précédent
                </button>
                <span className="dash-pagination-status">
                  Page {page} / {pageCount} — {total} paiement{total > 1 ? 's' : ''}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Suivant →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
