import { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'ajvpay_session';

/**
 * Header exigé sur toute requête mutante vers /dashboard/* (voir
 * SessionGuard). Sa valeur n'a aucune importance et n'est JAMAIS comparée à
 * un secret — sa seule fonction est de forcer une préflight CORS. Un site
 * tiers ne peut jamais faire approuver ce header par notre CORS (qui
 * n'autorise que l'origine exacte du dashboard), donc le navigateur bloque
 * la requête AVANT même qu'elle parte. C'est ce qui protège contre le CSRF
 * puisque le cookie de session est forcément SameSite=None (déploiement
 * cross-origin réel : dashboard sur Vercel, API sur Railway).
 */
export const CSRF_HEADER_NAME = 'x-ajvpay-dashboard';

export function sessionCookieOptions(maxAgeMs: number): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // SameSite=None exige Secure ; en dev (http://localhost) ça romprait le cookie
    sameSite: isProd ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}
