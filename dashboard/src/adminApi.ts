import type {
  AdminCredentials,
  CardFeature,
  ListItem,
  NewsPost,
  PendingManualPayment,
} from './types';
import { friendlyApiError } from './apiError';

/**
 * Auth admin distincte du client marchand (`api.ts`) : une simple clé
 * partagée (`Authorization: Bearer <adminKey>`), pas de signature HMAC —
 * `AdminApiKeyGuard` côté backend n'en exige pas, contrairement à
 * `ApiKeyGuard` (marchands).
 */
async function adminRequest<T>(
  creds: AdminCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Authorization: `Bearer ${creds.adminKey}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${creds.apiBaseUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(friendlyApiError(response.status, text, 'Une erreur est survenue'));
  }
  return response.json() as Promise<T>;
}

/** Payload partagé par les pays couverts et les réseaux de paiement (même forme côté backend). */
export interface ListItemPayload {
  name?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export interface NewsPostPayload {
  title?: string;
  body?: string;
  imageUrl?: string;
  isPublished?: boolean;
}

export interface CardFeaturePayload {
  title?: string;
  body?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export const adminApi = {
  listPending: (creds: AdminCredentials) =>
    adminRequest<PendingManualPayment[]>(creds, '/admin/manual-payments/pending'),

  confirm: (creds: AdminCredentials, paymentId: string) =>
    adminRequest(creds, `/admin/manual-payments/${paymentId}/confirm`, { method: 'POST' }),

  reject: (creds: AdminCredentials, paymentId: string) =>
    adminRequest(creds, `/admin/manual-payments/${paymentId}/reject`, { method: 'POST' }),

  // ----- Contenu du site : actualités -----

  listNews: (creds: AdminCredentials) => adminRequest<NewsPost[]>(creds, '/admin/site-content/news'),

  createNews: (creds: AdminCredentials, payload: NewsPostPayload) =>
    adminRequest<NewsPost>(creds, '/admin/site-content/news', { method: 'POST', body: payload }),

  updateNews: (creds: AdminCredentials, id: string, payload: NewsPostPayload) =>
    adminRequest<NewsPost>(creds, `/admin/site-content/news/${id}`, { method: 'PATCH', body: payload }),

  deleteNews: (creds: AdminCredentials, id: string) =>
    adminRequest(creds, `/admin/site-content/news/${id}`, { method: 'DELETE' }),

  // ----- Contenu du site : pays couverts -----

  listCountries: (creds: AdminCredentials) => adminRequest<ListItem[]>(creds, '/admin/site-content/countries'),

  createCountry: (creds: AdminCredentials, payload: ListItemPayload) =>
    adminRequest<ListItem>(creds, '/admin/site-content/countries', { method: 'POST', body: payload }),

  updateCountry: (creds: AdminCredentials, id: string, payload: ListItemPayload) =>
    adminRequest<ListItem>(creds, `/admin/site-content/countries/${id}`, { method: 'PATCH', body: payload }),

  deleteCountry: (creds: AdminCredentials, id: string) =>
    adminRequest(creds, `/admin/site-content/countries/${id}`, { method: 'DELETE' }),

  // ----- Contenu du site : réseaux de paiement -----

  listNetworks: (creds: AdminCredentials) => adminRequest<ListItem[]>(creds, '/admin/site-content/networks'),

  createNetwork: (creds: AdminCredentials, payload: ListItemPayload) =>
    adminRequest<ListItem>(creds, '/admin/site-content/networks', { method: 'POST', body: payload }),

  updateNetwork: (creds: AdminCredentials, id: string, payload: ListItemPayload) =>
    adminRequest<ListItem>(creds, `/admin/site-content/networks/${id}`, { method: 'PATCH', body: payload }),

  deleteNetwork: (creds: AdminCredentials, id: string) =>
    adminRequest(creds, `/admin/site-content/networks/${id}`, { method: 'DELETE' }),

  // ----- Contenu du site : piliers AJV Card -----

  listCardFeatures: (creds: AdminCredentials) =>
    adminRequest<CardFeature[]>(creds, '/admin/site-content/card-features'),

  createCardFeature: (creds: AdminCredentials, payload: CardFeaturePayload) =>
    adminRequest<CardFeature>(creds, '/admin/site-content/card-features', { method: 'POST', body: payload }),

  updateCardFeature: (creds: AdminCredentials, id: string, payload: CardFeaturePayload) =>
    adminRequest<CardFeature>(creds, `/admin/site-content/card-features/${id}`, {
      method: 'PATCH',
      body: payload,
    }),

  deleteCardFeature: (creds: AdminCredentials, id: string) =>
    adminRequest(creds, `/admin/site-content/card-features/${id}`, { method: 'DELETE' }),
};
