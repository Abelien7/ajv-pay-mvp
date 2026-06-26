import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Hash d'une clé API pour stockage en base (jamais en clair, même côté serveur).
 * Une vraie API key complète n'est montrée au marchand qu'une seule fois,
 * à la création — ensuite seul ce hash est comparé.
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Calcule une signature HMAC-SHA256 d'un payload avec le secret du marchand.
 * Utilisé à la fois pour vérifier une requête entrante signée par le marchand,
 * et pour signer les webhooks sortants qu'AJV Pay envoie.
 */
export function computeHmacSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Comparaison à temps constant pour éviter les attaques par timing
 * lors de la vérification d'une signature HMAC.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
