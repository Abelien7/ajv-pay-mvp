import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CSRF_HEADER_NAME } from './dashboard-auth/session-cookie.constants';

const DOCS_PATH = 'docs';

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
  // La CSP par défaut de helmet (script-src 'self', pas d'inline) bloque le
  // script de bootstrap inliné par Swagger UI — /docs est une page de
  // documentation en lecture seule, sans donnée sensible ni formulaire, donc
  // on l'exempte plutôt que d'affaiblir la CSP pour le reste de l'API.
  const helmetMiddleware = helmet();
  app.use((req: any, res: any, next: any) => {
    if (req.path === `/${DOCS_PATH}` || req.path.startsWith(`/${DOCS_PATH}/`) || req.path.startsWith(`/${DOCS_PATH}-json`)) {
      return next();
    }
    return helmetMiddleware(req, res, next);
  });
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

  setupSwagger(app);
}

/**
 * Documentation publique de l'API d'intégration (marchand/provider) —
 * volontairement exposée sans authentification, comme celle de Stripe : la
 * sécurité vient des clés API, pas du secret du schéma. N'inclut QUE les
 * routes destinées à un intégrateur tiers — les routes admin plateforme et
 * dashboard humain sont explicitly exclues via @ApiExcludeController() sur
 * leurs controllers respectifs (ManualReviewController, DashboardController,
 * DashboardAuthController), ainsi que /health et les webhooks entrants
 * provider (jamais appelés par un marchand).
 */
function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('AJV Pay — API')
    .setDescription(
      "API de paiement mobile money (Moov Money, Mixx by Yas, paiement vérifié à la main) pour l'Afrique de l'Ouest. " +
        'Commencez par intégrer avec une clé "test" (voir POST /merchants/register) — aucun impact financier, résolution instantanée.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        description: "Clé API du marchand (live ou test) — voir l'en-tête Authorization: Bearer <api_key>.",
      },
      'api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    customSiteTitle: 'AJV Pay — Documentation API',
  });
}
