import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/**
 * Point d'entrée du service Railway "API" (répond aux requêtes HTTP) —
 * distinct du service "Worker" (voir worker.ts, boucle de fond en continu,
 * pas de serveur HTTP), déployé depuis ce même dépôt comme un second
 * service Railway.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`AJV Pay (MVP) démarré sur le port ${port}`);
}

bootstrap();
