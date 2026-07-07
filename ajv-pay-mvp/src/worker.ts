import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

/**
 * Point d'entrée du service Railway "Worker" — pas de serveur HTTP
 * (`createApplicationContext`, pas `create`) : ce process ne fait que
 * tourner en fond (voir WorkerCronService) pour traiter l'outbox et livrer
 * les webhooks marchands. Démarré séparément de l'API (voir main.ts),
 * comme un second service Railway construit à partir du même dépôt.
 */
async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
  console.log('AJV Pay Worker démarré (traitement outbox + livraison webhooks en continu)');
}

bootstrap();
