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
    <div style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>AJV Pay — Admin plateforme</h1>
        <button onClick={onLogout} style={{ cursor: 'pointer' }}>
          Déconnexion
        </button>
      </div>

      {error && <p style={{ color: '#dc2626' }}>Erreur : {error}</p>}

      <h2>Paiements manuels en attente ({pending.length})</h2>

      {pending.length === 0 && <p style={{ color: '#666' }}>Aucun paiement en attente de vérification.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pending.map((p) => {
          const network = p.metadata?.network;
          return (
            <div key={p.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{p.merchant_name}</strong> — {Number(p.amount).toLocaleString('fr-FR')} {p.currency}
                  {network && (
                    <span style={{ marginLeft: 8, color: '#666' }}>({NETWORK_LABELS[network] ?? network})</span>
                  )}
                </div>
                <span style={{ color: '#666', fontSize: 13 }}>{new Date(p.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Téléphone : {p.phone_number ?? '—'}</div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Références soumises ({p.proofs.length}) :
                </div>
                {p.proofs.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#999' }}>Aucune référence soumise pour l'instant.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {p.proofs.map((proof) => (
                      <li key={proof.id} style={{ fontSize: 13 }}>
                        <code>{proof.submitted_reference}</code>
                        {proof.note && <span style={{ color: '#666' }}> — {proof.note}</span>}
                        <span style={{ color: '#999' }}> ({new Date(proof.created_at).toLocaleString('fr-FR')})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleDecision(p.id, 'confirm')}
                  disabled={busyId === p.id}
                  style={{
                    padding: '6px 14px',
                    cursor: busyId === p.id ? 'not-allowed' : 'pointer',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  {busyId === p.id ? '…' : 'Confirmer'}
                </button>
                <button
                  onClick={() => handleDecision(p.id, 'reject')}
                  disabled={busyId === p.id}
                  style={{
                    padding: '6px 14px',
                    cursor: busyId === p.id ? 'not-allowed' : 'pointer',
                    background: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    opacity: busyId === p.id ? 0.6 : 1,
                  }}
                >
                  {busyId === p.id ? '…' : 'Rejeter'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
