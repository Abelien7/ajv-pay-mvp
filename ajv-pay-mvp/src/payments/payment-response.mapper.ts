import { Payment } from './payment.entity';

/**
 * Forme de réponse HTTP d'un paiement — partagée entre PaymentsController
 * (accès API key, marchand ou intégrateur) et DashboardController (accès
 * session, dashboard humain) pour que les deux surfaces ne dérivent jamais
 * l'une de l'autre.
 */
export function toPaymentResponse(payment: Payment) {
  return {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    mode: payment.mode,
    status: payment.status,
    provider_reference: payment.provider_reference,
    redirect_url: payment.redirect_url,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  };
}
