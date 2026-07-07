import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Point d'entrée du service Railway "API" (répond aux requêtes HTTP) —
 * distinct du service "Worker" (voir worker.ts, boucle de fond en continu,
 * pas de serveur HTTP), déployé depuis ce même dépôt comme un second
 * service Railway.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());

  // CORS — en prod, restreindre à l'origine exacte du dashboard via CORS_ORIGIN
  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Signature', 'Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`AJV Pay (MVP) démarré sur le port ${port}`);
}

bootstrap();
