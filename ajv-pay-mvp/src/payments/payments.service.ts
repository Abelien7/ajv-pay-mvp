import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { PaymentEventsService } from '../events/payment-events.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus } from './payment.entity';
import { PaymentMode } from '../merchants/merchant.entity';

export interface ProviderResult {
  status: 'processing' | 'succeeded' | 'failed';
  providerReference?: string;
}

/**
 * PaymentsService — STATE MANAGEMENT, avec une nuance importante ajoutée
 * suite à la "Production Hardening Checklist" (review fintech) :
 *
 * Pour les transitions vers un état FINAL (succeeded/failed/expired/refunded),
 * ce service N'OUVRE PLUS sa propre transaction isolée. Il expose
 * `applyFinalTransition(client, ...)`, qui participe à une transaction
 * pilotée par PaymentOrchestrator — pour que la mise à jour du statut,
 * l'écriture du ledger et la publication de l'événement outbox commitent
 * ENSEMBLE, ou pas du tout. Sans ça, un crash entre deux étapes pourrait
 * laisser un paiement marqué `succeeded` sans aucune trace comptable ni
 * notification — exactement le risque identifié par la checklist (section
 * "Outbox écrit dans la même transaction DB que le payment update").
 *
 * `setProcessing()` reste une transition à transaction propre : ce n'est
 * pas un état final, aucune écriture ledger n'y est jamais associée, donc
 * aucune perte financière possible si elle échoue isolément.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly idempotency: IdempotencyService,
    private readonly events: PaymentEventsService,
  ) {}

  /**
   * Crée un paiement de façon idempotente. Idempotency + insert + event
   * "created" restent atomiques (même transaction SQL) — création seule,
   * pas de ledger/outbox concerné à ce stade (un paiement `pending` n'a
   * encore aucune réalité financière).
   */
  async create(
    dto: CreatePaymentDto,
    merchant: { id: string },
    mode: PaymentMode,
    idempotencyKey: string,
  ): Promise<Payment> {
    if (!idempotencyKey) {
      throw new Error('Idempotency-Key est obligatoire pour créer un paiement.');
    }
    const merchantId = merchant.id;

    const { payment, isReplay } = await this.db.withTransaction(async (client) => {
      const check = await this.idempotency.checkAndReserve(client, merchantId, mode, idempotencyKey, dto);

      if (check.isReplay && check.existingResponse) {
        return { payment: check.existingResponse as Payment, isReplay: true };
      }

      const existingPayment = await client.query<Payment>(
        `SELECT * FROM payments WHERE merchant_id = $1 AND mode = $2 AND idempotency_key = $3`,
        [merchantId, mode, idempotencyKey],
      );
      if (existingPayment.rows.length > 0) {
        return { payment: existingPayment.rows[0], isReplay: true };
      }

      const inserted = await client.query<Payment>(
        `INSERT INTO payments
           (merchant_id, amount, currency, method, mode, phone_number, idempotency_key, metadata, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         RETURNING *`,
        [
          merchantId,
          dto.amount,
          dto.currency ?? 'XOF',
          dto.method,
          mode,
          dto.phoneNumber,
          idempotencyKey,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
        ],
      );
      const created = inserted.rows[0];

      await this.events.record(client, created.id, 'created', { amount: created.amount });
      await this.idempotency.storeResponse(client, merchantId, mode, idempotencyKey, created);

      return { payment: created, isReplay: false };
    });

    if (isReplay) {
      this.logger.log(`Replay idempotent pour payment=${payment.id}`);
    }
    return payment;
  }

  /**
   * Transition pending → processing. Transaction propre : pas d'état
   * final, pas de ledger associé, donc aucun risque financier à l'isoler.
   */
  async setProcessing(paymentId: string): Promise<Payment> {
    return this.db.withTransaction((client) =>
      this.transitionCore(client, paymentId, 'processing'),
    );
  }

  /**
   * Point d'entrée pour TOUTE transition vers un état final
   * (succeeded/failed/expired/refunded). Ne gère AUCUNE transaction
   * elle-même : c'est l'appelant (PaymentOrchestrator) qui doit l'invoquer
   * à l'intérieur de son propre `db.withTransaction(...)`, avec le même
   * client utilisé pour les écritures ledger/outbox qui doivent commiter
   * avec elle de façon atomique.
   */
  async applyFinalTransition(
    client: PoolClient,
    paymentId: string,
    newStatus: PaymentStatus,
    eventPayload: Record<string, unknown> = {},
    providerReference?: string,
    redirectUrl?: string,
  ): Promise<Payment> {
    return this.transitionCore(client, paymentId, newStatus, eventPayload, providerReference, redirectUrl);
  }

  /** Liste paginée des paiements d'un marchand, plus récents en premier — utilisée par le dashboard. */
  async listPayments(merchantId: string, limit = 20, offset = 0): Promise<{ items: Payment[]; total: number }> {
    const { rows } = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );
    const { rows: countRows } = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM payments WHERE merchant_id = $1`,
      [merchantId],
    );
    return { items: rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async getPayment(merchantId: string, paymentId: string): Promise<Payment> {
    const { rows } = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE id = $1 AND merchant_id = $2`,
      [paymentId, merchantId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Payment ${paymentId} introuvable`);
    }
    return rows[0];
  }

  /** Lecture interne sans filtre marchand — utilisée par l'orchestrateur. */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    const { rows } = await this.db.query<Payment>(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    return rows[0] ?? null;
  }

  async findByProviderReference(providerReference: string): Promise<Payment | null> {
    const { rows } = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE provider_reference = $1`,
      [providerReference],
    );
    return rows[0] ?? null;
  }

  /**
   * Logique d'écriture brute (lock + garde-fous + UPDATE + payment_events),
   * SANS gestion de transaction — c'est la responsabilité de l'appelant
   * (soit `setProcessing` avec sa propre transaction, soit
   * `applyFinalTransition` avec la transaction de l'orchestrateur).
   *
   * Garde-fous conservés à l'identique :
   *   - transition vers le même statut → no-op (idempotence des webhooks redélivrés)
   *   - transition depuis un état déjà final → refusée (succeeded → failed
   *     interdit, et inversement — règle explicitement demandée par la
   *     checklist de hardening).
   */
  private async transitionCore(
    client: PoolClient,
    paymentId: string,
    newStatus: PaymentStatus,
    eventPayload: Record<string, unknown> = {},
    providerReference?: string,
    redirectUrl?: string,
  ): Promise<Payment> {
    const { rows } = await client.query<Payment>(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Payment ${paymentId} introuvable`);
    }
    const payment = rows[0];

    if (payment.status === newStatus) {
      this.logger.warn(`Transition ignorée (déjà en statut ${newStatus}) pour ${paymentId}`);
      return payment;
    }
    if (['succeeded', 'failed', 'expired', 'refunded'].includes(payment.status)) {
      this.logger.warn(
        `Transition refusée : payment=${paymentId} déjà dans un état final (${payment.status})`,
      );
      return payment;
    }

    const updated = await client.query<Payment>(
      `UPDATE payments SET
         status = $2,
         provider_reference = COALESCE($3, provider_reference),
         redirect_url = COALESCE($4, redirect_url)
       WHERE id = $1 RETURNING *`,
      [paymentId, newStatus, providerReference ?? null, redirectUrl ?? null],
    );
    const newPayment = updated.rows[0];

    await this.events.record(client, paymentId, newStatus as any, eventPayload);

    return newPayment;
  }
}
