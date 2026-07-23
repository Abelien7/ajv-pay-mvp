import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';

/**
 * Par défaut, `pg` renvoie les colonnes BIGINT (OID 20) sous forme de
 * string, pas de number, pour éviter une perte de précision silencieuse
 * sur de très grandes valeurs. Les deux seules colonnes BIGINT du schéma
 * sont `payments.amount` et `ledger_entries.amount` (montants en plus
 * petite unité de devise) — toujours très loin de Number.MAX_SAFE_INTEGER
 * (2^53), donc le risque de précision ne s'applique pas ici. Sans ce
 * parseur, `payment.amount` arrivait en string jusque dans les réponses API
 * et les webhooks marchand (`"amount":"10000"` au lieu de `10000`), en
 * contradiction avec le DTO d'entrée qui exige `amount: number` — corrigé
 * une fois pour toutes ici plutôt qu'avec des `Number(...)` éparpillés à
 * chaque point de sortie.
 */
types.setTypeParser(20, (value: string) => Number(value));

/**
 * Couche d'accès PostgreSQL volontairement "fine" (pas d'ORM).
 *
 * Pourquoi pas un ORM (TypeORM/Prisma) au MVP :
 * la correction financière (idempotency + ledger en même transaction SQL,
 * jamais de demi-écriture) est plus facile à garantir et à auditer avec du
 * SQL explicite et un contrôle total de BEGIN/COMMIT/ROLLBACK, plutôt qu'à
 * travers les abstractions d'un ORM. Ça reste un choix MVP : si l'équipe
 * grossit, un ORM peut être introduit module par module sans tout casser,
 * car tout l'accès DB passe déjà par ce service unique.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  // Initialisé dans onModuleInit() (pas dans le constructeur, car
  // ConfigService doit d'abord avoir chargé les variables d'environnement).
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_URL'),
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  /** Requête simple, hors transaction explicite. */
  query<T extends QueryResultRow = any>(
    text: string,
    params: any[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Exécute `fn` dans une transaction SQL unique (BEGIN/COMMIT/ROLLBACK).
   *
   * C'est le point central de la correctness financière du MVP :
   * - création du payment + payment_event "created" + (le cas échéant)
   *   les écritures de ledger doivent toujours être commises ensemble
   *   ou pas du tout. Aucune route métier ne doit faire plusieurs requêtes
   *   indépendantes pour une même opération de paiement.
   */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
