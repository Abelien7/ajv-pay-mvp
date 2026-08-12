import type { MerchantMeResponse, PaymentDto, PaymentListResponse, RegisterMerchantResponse } from './types';
import { friendlyApiError } from './apiError';

/**
 * En production, pointe vers `/api-proxy` (voir `vercel.json`) — un
 * rewrite Vercel qui relaie transparentement vers l'API Render, plutôt que
 * l'URL Render directe utilisée jusqu'ici. Trouvé le 2026-08-12 : le cookie
 * de session dashboard est correctement configuré (`Secure; SameSite=None`,
 * vérifié via `curl -i`), mais un appel direct cross-origin (Vercel →
 * Render, deux domaines complètement distincts) en fait un cookie TIERS —
 * de plus en plus bloqué par défaut par Chrome/Safari/Firefox, ce qui
 * faisait perdre la session à chaque rechargement de page. En passant par
 * ce proxy same-origin, le navigateur ne voit jamais Render directement :
 * le cookie devient un cookie de premier niveau pour ajv-pay-mvp.vercel.app,
 * plus soumis à aucun blocage tiers. N'affecte que ce fichier (le seul à
 * utiliser `credentials: 'include'` — voir siteContentApi.ts/adminApi.ts,
 * qui n'ont pas ce problème et peuvent rester en appel direct).
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * Header exigé par SessionGuard sur toute requête mutante (voir
 * src/common/auth/session.guard.ts côté backend, session-cookie.constants.ts
 * pour le nom exact — DOIT rester synchronisé avec CSRF_HEADER_NAME).
 * Sa valeur n'a aucune importance : sa seule fonction est de forcer une
 * préflight CORS, qu'un site tiers ne peut jamais faire approuver.
 */
const CSRF_HEADER_NAME = 'x-ajvpay-dashboard';

export class DashboardApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (method !== 'GET') {
    headers[CSRF_HEADER_NAME] = '1';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include', // envoie/reçoit le cookie de session — jamais de clé API/HMAC ici
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new DashboardApiError(response.status, friendlyApiError(response.status, text, 'Une erreur est survenue'));
  }
  return response.json() as Promise<T>;
}

export const dashboardApi = {
  login: (email: string, password: string) =>
    request<{ id: string; name: string }>('/dashboard/login', { method: 'POST', body: { email, password } }),

  logout: () => request<{ status: string }>('/dashboard/logout', { method: 'POST' }),

  getMe: () => request<MerchantMeResponse>('/dashboard/me'),

  updateWebhookUrl: (webhookUrl: string) =>
    request<{ webhook_url: string }>('/dashboard/webhook-url', { method: 'PATCH', body: { webhookUrl } }),

  listPayments: (limit = 20, offset = 0) =>
    request<PaymentListResponse>(`/dashboard/payments?limit=${limit}&offset=${offset}`),

  refundPayment: (paymentId: string) =>
    request<PaymentDto>(`/dashboard/payments/${paymentId}/refund`, { method: 'POST', body: {} }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ status: string }>('/dashboard/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  /** Inscription publique — pas de session requise (voir POST /merchants/register côté backend). */
  register: (name: string, email: string, password: string, webhookUrl?: string) =>
    request<RegisterMerchantResponse>('/merchants/register', {
      method: 'POST',
      body: { name, email, password, ...(webhookUrl ? { webhookUrl } : {}) },
    }),
};
