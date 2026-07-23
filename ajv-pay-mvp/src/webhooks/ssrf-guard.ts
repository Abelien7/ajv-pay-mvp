import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

/**
 * Un `webhook_url` marchand est fourni par le marchand lui-même (ou un
 * compte marchand compromis) et déclenche un appel réseau SORTANT depuis le
 * serveur AJV Pay à chaque transition de paiement, avec le payload complet
 * (montant, référence provider, metadata) — une cible interne (ex:
 * `http://169.254.169.254/...` métadonnées cloud, ou un service Railway
 * interne) transformerait ça en SSRF classique. La validation `@IsUrl` au
 * niveau DTO (voir register-merchant.dto.ts / update-webhook-url.dto.ts)
 * ne suffit pas : elle ne vérifie que la syntaxe au moment de
 * l'enregistrement, jamais l'adresse IP réelle résolue au moment de
 * chaque envoi (le DNS peut changer après coup — "DNS rebinding").
 *
 * Appelée juste avant CHAQUE tentative de livraison (voir
 * WebhooksService.attemptDelivery), pas seulement à l'enregistrement.
 */
export async function assertPublicWebhookUrl(urlString: string): Promise<void> {
  const url = new URL(urlString);
  if (url.protocol !== 'https:') {
    throw new Error(`URL de webhook non https (${url.protocol}), envoi refusé.`);
  }

  const { address } = await lookup(url.hostname);
  if (isPrivateOrReservedIp(address)) {
    throw new Error(`URL de webhook résout vers une adresse interne (${address}), envoi refusé.`);
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // privé (RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) return true; // privé (RFC 1918)
    if (a === 192 && b === 168) return true; // privé (RFC 1918)
    if (a === 169 && b === 254) return true; // link-local, inclut les métadonnées cloud (169.254.169.254)
    if (a === 0) return true;
    return false;
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
    const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped) return isPrivateOrReservedIp(v4Mapped[1]);
    return false;
  }

  // Ne devrait jamais arriver après un lookup() réussi (renvoie toujours
  // une IPv4 ou IPv6 valide) — prudence par défaut si le format change un jour.
  return true;
}
