import { FormEvent, useEffect, useState } from 'react';
import { api } from './api';
import type { Credentials, MerchantMeResponse, PaymentDto } from './types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  processing: 'En cours',
  succeeded: 'Réussi',
  failed: 'Échoué',
  expired: 'Expiré',
  refunded: 'Remboursé',
};

export function Dashboard({ credentials, onLogout }: { credentials: Credentials; onLogout: () => void }) {
  const [me, setMe] = useState<MerchantMeResponse | null>(null);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  async function load() {
    try {
      const [meResponse, paymentsResponse] = await Promise.all([
        api.getMe(credentials),
        api.listPayments(credentials, 20, 0),
      ]);
      setMe(meResponse);
      setWebhookUrlInput(meResponse.webhook_url ?? '');
      setPayments(paymentsResponse.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefund(paymentId: string) {
    if (!window.confirm('Confirmer le remboursement de ce paiement ?')) return;
    setRefundingId(paymentId);
    setError(null);
    try {
      await api.refundPayment(credentials, paymentId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du remboursement');
    } finally {
      setRefundingId(null);
    }
  }

  async function handleSaveWebhookUrl(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateWebhookUrl(credentials, webhookUrlInput);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="header-row">
        <h1 className="brand-title">
          AJV <span>Pay</span> — {me?.name ?? '…'}
        </h1>
        <button onClick={onLogout} className="btn btn-secondary btn-sm">
          Déconnexion
        </button>
      </div>

      {error && <p className="error-banner">Erreur : {error}</p>}

      <div className="stat-row">
        <div className="card stat-card">
          <div className="stat-label">Solde à reverser</div>
          <div className="stat-value">{me ? `${me.balance.toLocaleString('fr-FR')} XOF` : '…'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Statut compte</div>
          <div className="stat-value">{me?.is_active ? 'Actif' : 'Inactif'}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="section-title">Webhook</h2>
        <form onSubmit={handleSaveWebhookUrl} style={{ display: 'flex', gap: 8 }}>
          <input
            value={webhookUrlInput}
            onChange={(e) => setWebhookUrlInput(e.target.value)}
            placeholder="https://votre-site.com/webhooks/ajvpay"
            className="field"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title">Paiements récents</h2>
        {payments.length === 0 ? (
          <p className="empty-state">Aucun paiement pour le moment.</p>
        ) : (
          <table className="payments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Montant</th>
                <th>Méthode</th>
                <th>Statut</th>
                <th>Référence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
                  <td>
                    {Number(p.amount).toLocaleString('fr-FR')} {p.currency}
                  </td>
                  <td>{p.method}</td>
                  <td>
                    <span className={`badge badge-${p.status}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
                  </td>
                  <td>{p.provider_reference ?? '—'}</td>
                  <td>
                    {p.status === 'succeeded' && (
                      <button
                        onClick={() => handleRefund(p.id)}
                        disabled={refundingId === p.id}
                        className="btn btn-danger btn-sm"
                      >
                        {refundingId === p.id ? '…' : 'Rembourser'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
