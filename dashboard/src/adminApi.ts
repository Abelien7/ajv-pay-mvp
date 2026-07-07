import type { AdminCredentials, PendingManualPayment } from './types';

/**
 * Auth admin distincte du client marchand (`api.ts`) : une simple clé
 * partagée (`Authorization: Bearer <adminKey>`), pas de signature HMAC —
 * `AdminApiKeyGuard` côté backend n'en exige pas, contrairement à
 * `ApiKeyGuard` (marchands).
 */
async function adminRequest<T>(
  creds: AdminCredentials,
  path: string,
  options: { method?: string } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await fetch(`${creds.apiBaseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${creds.adminKey}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export const adminApi = {
  listPending: (creds: AdminCredentials) =>
    adminRequest<PendingManualPayment[]>(creds, '/admin/manual-payments/pending'),

  confirm: (creds: AdminCredentials, paymentId: string) =>
    adminRequest(creds, `/admin/manual-payments/${paymentId}/confirm`, { method: 'POST' }),

  reject: (creds: AdminCredentials, paymentId: string) =>
    adminRequest(creds, `/admin/manual-payments/${paymentId}/reject`, { method: 'POST' }),
};
