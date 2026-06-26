import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface IdempotencyCheckResult {
  /** true si une réponse existante doit être renvoyée telle quelle */
  isReplay: boolean;
  /** réponse précédemment stockée, si isReplay = true */
  existingResponse: any | null;
}

/**
 * Garantit que deux requêtes de création de paiement portant la même
 * (merchant_id, idempotency_key) ne créent jamais deux paiements, même en
 * cas de double-clic, de retry réseau côté marchand, ou de redélivrance
 * applicative.
 *
 * Règle stricte : si la clé existe déjà mais que le payload diffère
 * (request_hash différent), c'est un conflit explicite — pas un replay
 * silencieux d'une réponse qui ne correspond pas à la requête actuelle.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly db: DatabaseService) {}

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * À appeler en tout début de traitement, AVANT toute écriture métier,
   * et dans la même transaction que la création du paiement (cf. PaymentsService).
   */
  async checkAndReserve(
    client: PoolClient,
    merchantId: string,
    idemKey: string,
    requestPayload: unknown,
  ): Promise<IdempotencyCheckResult> {
    const requestHash = this.hashPayload(requestPayload);

    const { rows } = await client.query(
      `SELECT request_hash, response FROM idempotency_keys
       WHERE merchant_id = $1 AND idem_key = $2
       FOR UPDATE`,
      [merchantId, idemKey],
    );

    if (rows.length > 0) {
      const existing = rows[0];
      if (existing.request_hash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key déjà utilisée avec un payload différent',
        );
      }
      return { isReplay: true, existingResponse: existing.response };
    }

    // Réservation de la clé avant même de savoir le résultat final : si le
    // process crashe entre la réservation et l'écriture de la réponse, la
    // clé existe mais sans réponse — le code appelant doit gérer ce cas en
    // continuant le traitement (idempotent par construction du paiement lui-même
    // via la contrainte UNIQUE(merchant_id, idempotency_key) sur `payments`).
    await client.query(
      `INSERT INTO idempotency_keys (merchant_id, idem_key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id, idem_key) DO NOTHING`,
      [merchantId, idemKey, requestHash],
    );

    return { isReplay: false, existingResponse: null };
  }

  /** À appeler une fois la réponse finale connue, dans la même transaction. */
  async storeResponse(
    client: PoolClient,
    merchantId: string,
    idemKey: string,
    response: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_keys SET response = $3
       WHERE merchant_id = $1 AND idem_key = $2`,
      [merchantId, idemKey, JSON.stringify(response)],
    );
  }
}
