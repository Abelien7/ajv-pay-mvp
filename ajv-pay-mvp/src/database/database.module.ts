import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Module global : la connexion à PostgreSQL est nécessaire dans presque
 * tous les modules métier (payments, ledger, webhooks...). On l'expose
 * une fois ici plutôt que de la réimporter partout.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
