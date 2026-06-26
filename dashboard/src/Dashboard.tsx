import { FormEvent, useEffect, useState } from 'react';
import { api } from './api';
import type { Credentials, MerchantMeResponse, PaymentDto } from './types';

const STATUS_COLORS: Record<string, string> = {
  pending: '#9ca3af',
  processing: '#2563eb',
  succeeded: '#16a34a',
  failed: '#dc2626',
  expired: '#6b7280',
  refunded: '#7c3aed',
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
    <div style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>AJV Pay — {me?.name ?? '…'}</h1>
        <button onClick={onLogout} style={{ cursor: 'pointer' }}>
          Déconnexion
        </button>
      </div>

      {error && <p style={{ color: '#dc2626' }}>Erreur : {error}</p>}

      <section style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
        <Card label="Solde à reverser" value={me ? `${me.balance.toLocaleString('fr-FR')} XOF` : '…'} />
        <Card label="Statut compte" value={me?.is_active ? 'Actif' : 'Inactif'} />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Webhook</h2>
        <form onSubmit={handleSaveWebhookUrl} style={{ display: 'flex', gap: 8 }}>
          <input
            value={webhookUrlInput}
            onChange={(e) => setWebhookUrlInput(e.target.value)}
            placeholder="https://votre-site.com/webhooks/ajvpay"
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={saving} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </section>

      <section>
        <h2>Paiements récents</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Montant</th>
              <th style={thStyle}>Méthode</th>
              <th style={thStyle}>Statut</th>
              <th style={thStyle}>Référence</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{new Date(p.created_at).toLocaleString('fr-FR')}</td>
                <td style={tdStyle}>
                  {p.amount.toLocaleString('fr-FR')} {p.currency}
                </td>
                <td style={tdStyle}>{p.method}</td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLORS[p.status] ?? '#000', fontWeight: 600 }}>{p.status}</span>
                </td>
                <td style={tdStyle}>{p.provider_reference ?? '—'}</td>
                <td style={tdStyle}>
                  {p.status === 'succeeded' && (
                    <button
                      onClick={() => handleRefund(p.id)}
                      disabled={refundingId === p.id}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: refundingId === p.id ? 'not-allowed' : 'pointer',
                        background: '#7c3aed',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        opacity: refundingId === p.id ? 0.6 : 1,
                      }}
                    >
                      {refundingId === p.id ? '…' : 'Rembourser'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={6}>
                  Aucun paiement pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const thStyle = { padding: '8px 4px', fontSize: 13, color: '#555' };
const tdStyle = { padding: '8px 4px', fontSize: 14 };
