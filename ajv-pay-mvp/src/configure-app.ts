import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { CSRF_HEADER_NAME } from './dashboard-auth/session-cookie.constants';

/**
 * Configuration commune du process HTTP "API" — appelée à la fois par
 * main.ts (bootstrap réel) ET par test/utils/test-app.ts (harnais e2e).
 *
 * Avant l'introduction du cookie de session dashboard, cette config vivait
 * uniquement dans main.ts : les tests e2e démarraient l'app SANS
 * cookie-parser ni CORS, ce qui masquait silencieusement un vrai bug
 * (SessionGuard ne recevait jamais de cookie parsé en test — voir l'échec
 * initial de dashboard-auth.e2e-spec.ts). Une seule fonction partagée
 * élimine ce risque de divergence prod/test pour de bon.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(cookieParser());

  // '*' est traité comme "non configuré" : avec credentials: true (obligatoire
  // pour le cookie de session dashboard), un wildcard est de toute façon
  // rejeté par le navigateur — mais le paquet `cors` lui-même envoie encore
  // littéralement `Access-Control-Allow-Origin: *` si on le lui passe tel
  // quel, ce qui casse silencieusement les cookies sans jamais lever
  // d'erreur côté serveur. Trouvé en testant dans un vrai navigateur (un
  // vieux .env local avait CORS_ORIGIN=* — exactement le genre de valeur
  // qu'une config Railway datant d'avant ce chantier pourrait encore avoir).
  const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? process.env.CORS_ORIGIN : undefined;
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN est obligatoire en production (origine exacte du dashboard, pas de wildcard).');
  }
  app.enableCors({
    origin: corsOrigin ?? true, // en dev/test seulement : reflète l'origine de la requête
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Signature', 'Idempotency-Key', CSRF_HEADER_NAME],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
