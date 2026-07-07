import { useEffect, useState } from 'react';
import { adminApi } from './adminApi';
import type { AdminCredentials, PendingManualPayment } from './types';

const NETWORK_LABELS: Record<string, string> = { moov: 'Moov Money', mixx: 'Mixx by Yas' };

export function AdminDashboard({
  credentials,
  onLogout,
}: {
  credentials: AdminCredentials;
  onLogout: () => void;
}) {
  const [pending, setPending] = useState<PendingManualPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const items = await adminApi.listPending(credentials);
      setPending(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecision(paymentId: string, decision: 'confirm' | 'reject') {
    const verb = decision === 'confirm' ? 'confirmer' : 'rejeter';
    if (!window.confirm(`Voulez-vous ${verb} ce paiement ?`)) return;

    setBusyId(paymentId);
    setError(null);
    try {
      if (decision === 'confirm') await adminApi.confirm(credentials, paymentId);
      else await adminApi.reject(credentials, paymentId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la décision');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="header-row">
        <h1 className="brand-title">
          AJV <span>Pay</span> — Admin
        </h1>
        <button onClick={onLogout} className="btn btn-secondary btn-sm">
          Déconnexion
        </button>
      </div>

      {error && <p className="error-banner">Erreur : {error}</p>}

      <h2 className="section-title">Paiements manuels en attente ({pending.length})</h2>

      {pending.length === 0 ? (
        <div className="card">
          <p className="empty-state">Aucun paiement en attente de vérification.</p>
        </div>
      ) : (
        <div className="stack">
          {pending.map((p) => {
            const network = p.metadata?.network;
            return (
              <div key={p.id} className="card">
                <div className="payment-card-top">
                  <div>
                    <span className="payment-amount">
                      {Number(p.amount).toLocaleString('fr-FR')} {p.currency}
                    </span>{' '}
                    <strong>— {p.merchant_name}</strong>
                    {network && <span className="badge badge-processing" style={{ marginLeft: 8 }}>{NETWORK_LABELS[network] ?? network}</span>}
                  </div>
                  <span className="payment-meta">{new Date(p.created_at).toLocaleString('fr-FR')}</span>
                </div>
                <div className="payment-meta">Téléphone : {p.phone_number ?? '—'}</div>

                <div className="proof-heading">Références soumises ({p.proofs.length})</div>
                {p.proofs.length === 0 ? (
                  <p className="payment-meta">Aucune référence soumise pour l'instant.</p>
                ) : (
                  <ul className="proof-list">
                    {p.proofs.map((proof) => (
                      <li key={proof.id}>
                        <code>{proof.submitted_reference}</code>
                        {proof.note && <span className="payment-meta"> — {proof.note}</span>}
                        <span className="payment-meta"> ({new Date(proof.created_at).toLocaleString('fr-FR')})</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="actions-row">
                  <button
                    onClick={() => handleDecision(p.id, 'confirm')}
                    disabled={busyId === p.id}
                    className="btn btn-success btn-sm"
                  >
                    {busyId === p.id ? '…' : 'Confirmer'}
                  </button>
                  <button
                    onClick={() => handleDecision(p.id, 'reject')}
                    disabled={busyId === p.id}
                    className="btn btn-danger btn-sm"
                  >
                    {busyId === p.id ? '…' : 'Rejeter'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
