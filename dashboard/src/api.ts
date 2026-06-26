import type { Credentials, MerchantMeResponse, PaymentDto, PaymentListResponse } from './types';

/**
 * Signature HMAC-SHA256 calculée côté navigateur via Web Crypto, exactement
 * comme `computeHmacSignature` côté backend (src/common/auth/hmac.util.ts) —
 * obligatoire dès qu'une requête a un body (POST/PATCH/PUT).
 *
 * AVERTISSEMENT (limitation connue du MVP, voir docs/dashboard.md) : ce
 * dashboard demande au marchand de coller son `hmac_secret` d'intégration
 * dans le navigateur pour pouvoir signer ces requêtes. C'est acceptable
 * pour un MVP/outil interne, mais PAS le modèle de Stripe (qui utilise un
 * cookie de session distinct des clés d'API d'intégration). Avant
 * d'exposer ce dashboard à des marchands externes non techniques, remplacer
 * ce flux par une authentification dashboard dédiée (session token émis
 * après login email/mot de passe, jamais le secret HMAC d'intégration).
 */
async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function request<T>(
  creds: Credentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    'Content-Type': 'application/json',
  };

  let bodyString: string | undefined;
  if (options.body !== undefined) {
    bodyString = JSON.stringify(options.body);
    headers['X-Signature'] = await hmacSign(creds.hmacSecret, bodyString);
  }

  const response = await fetch(`${creds.apiBaseUrl}${path}`, { method, headers, body: bodyString });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getMe: (creds: Credentials) => request<MerchantMeResponse>(creds, '/merchants/me'),

  updateWebhookUrl: (creds: Credentials, webhookUrl: string) =>
    request<{ webhook_url: string }>(creds, '/merchants/me/webhook-url', {
      method: 'PATCH',
      body: { webhookUrl },
    }),

  listPayments: (creds: Credentials, limit = 20, offset = 0) =>
    request<PaymentListResponse>(creds, `/payments?limit=${limit}&offset=${offset}`),

  refundPayment: (creds: Credentials, paymentId: string) =>
    request<PaymentDto>(creds, `/payments/${paymentId}/refund`, {
      method: 'POST',
      body: {}, // body vide mais signé — le guard exige X-Signature sur tout POST
    }),
};
