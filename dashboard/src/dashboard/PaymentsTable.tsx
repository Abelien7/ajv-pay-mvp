import type { PaymentDto } from '../types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  processing: 'En cours',
  succeeded: 'Réussi',
  failed: 'Échoué',
  expired: 'Expiré',
  refunded: 'Remboursé',
};

/** onRefund undefined = pas de colonne Actions (aperçu sur l'accueil, pas la page Transactions). */
export function PaymentsTable({
  payments,
  onRefund,
  refundingId,
}: {
  payments: PaymentDto[];
  onRefund: ((paymentId: string) => void) | undefined;
  refundingId: string | null;
}) {
  if (payments.length === 0) {
    return <p className="empty-state">Aucun paiement pour le moment.</p>;
  }

  return (
    <table className="payments-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Montant</th>
          <th>Méthode</th>
          <th>Statut</th>
          <th>Référence</th>
          {onRefund && <th>Actions</th>}
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
            {onRefund && (
              <td>
                {p.status === 'succeeded' && (
                  <button onClick={() => onRefund(p.id)} disabled={refundingId === p.id} className="btn btn-danger btn-sm">
                    {refundingId === p.id ? '…' : 'Rembourser'}
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
