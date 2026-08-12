import { useEffect, useRef, useState } from 'react';
import { dashboardApi } from '../../dashboardApi';
import type { PaymentDto } from '../../types';
import { PaymentsTable } from '../PaymentsTable';

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 15_000;

export function Transactions() {
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Compteur de requêtes : une réponse dont le numéro ne correspond plus au
  // dernier appel lancé est ignorée. Sans ça, deux clics rapides sur
  // "Suivant"/"Précédent" (ou un rafraîchissement automatique qui répond
  // après un changement de page manuel) peuvent faire gagner la réponse la
  // plus lente et afficher des données d'une autre page que celle demandée.
  const requestSeq = useRef(0);

  async function load(showLoading: boolean) {
    const seq = ++requestSeq.current;
    if (showLoading) setLoading(true);
    try {
      const res = await dashboardApi.listPayments(PAGE_SIZE, offset);
      if (seq !== requestSeq.current) return; // réponse obsolète, une requête plus récente est en cours
      setPayments(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      if (seq === requestSeq.current && showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // Rafraîchissement périodique silencieux (pas de "Chargement…" qui
    // clignote toutes les 15s) — un marchand qui surveille l'arrivée d'un
    // paiement doit le voir apparaître sans recharger la page.
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  async function handleRefund(paymentId: string) {
    if (!window.confirm('Confirmer le remboursement de ce paiement ?')) return;
    setRefundingId(paymentId);
    setError(null);
    setSuccess(null);
    try {
      await dashboardApi.refundPayment(paymentId);
      await load(false);
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
