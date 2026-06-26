import { BadRequestException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentsService } from '../payments/payments.service';
import { ConnectorService } from '../connectors/connector.service';
import { ProviderName } from '../connectors/connector.interface';
import { LedgerService, providerLedgerAccount } from '../ledger/ledger.service';
import { OutboxService, OutboxEventType } from '../outbox/outbox.service';
import { CreatePaymentDto } from '../payments/dto/create-payment.dto';
import { Payment, PaymentStatus } from '../payments/payment.entity';

/**
 * PaymentOrchestrator — RÈGLE ARCHITECTURALE FONDAMENTALE :
 * tout le cycle de vie d'un paiement est coordonné ICI, et nulle part
 * ailleurs. PaymentsService, ConnectorService, LedgerService et
 * OutboxService sont de purs "providers de side-effects".
 *
 * MISE À JOUR (suite à la "Production Hardening Checklist" — review
 * fintech) : pour toute transition vers un état FINAL
 * (succeeded/failed/expired/refunded), l'orchestrateur ouvre désormais UNE
 * SEULE transaction SQL couvrant :
 *   1. la mise à jour du statut du paiement (PaymentsService.applyFinalTransition)
 *   2. l'écriture du ledger si succeeded/refunded (LedgerService.writeEntries)
 *   3. la publication de l'événement outbox (OutboxService.recordInTransaction)
 *
 * Avant cette correction, ces trois écritures se faisaient dans des
 * transactions séparées : un crash entre deux d'entre elles pouvait laisser
 * un paiement marqué `succeeded` sans aucune trace comptable ni
 * notification — jamais rattrapable, puisque l'état final bloque toute
 * nouvelle transition. C'est exactement le risque qu'une vraie checklist de
 * mise en production fintech identifie en premier.
 *
 * L'appel réseau au provider (`connector.initiate`) reste, lui, TOUJOURS
 * hors transaction — c'est la seule étape qui implique un appel externe,
 * et son résultat est connu avant l'ouverture de la transaction qui
 * commitera ses conséquences.
 */
@Injectable()
export class PaymentOrchestrator {
  private readonly logger = new Logger(PaymentOrchestrator.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly payments: PaymentsService,
    private readonly connector: ConnectorService,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Flux complet de création d'un paiement :
   *   1. create             (PaymentsService — idempotent, transaction propre)
   *   2. outbox.record       (payment.created — best-effort, non critique)
   *   3. setProcessing      (PaymentsService — transaction propre, pas d'état final)
   *   4. connector.initiate  (ConnectorService — hors transaction)
   *   5. commitFinalState    (transaction UNIQUE : statut + ledger + outbox)
   */
  async createPayment(dto: CreatePaymentDto, merchant: { id: string }, idempotencyKey: string): Promise<Payment> {
    const payment = await this.payments.create(dto, merchant, idempotencyKey);

    if (['succeeded', 'failed', 'expired', 'refunded'].includes(payment.status)) {
      return payment; // replay idempotent d'un paiement déjà finalisé
    }
    if (payment.status === 'processing') {
      return payment; // replay pendant une initiation déjà en cours
    }

    await this.publishBestEffort('payment.created', payment);

    try {
      const processing = await this.payments.setProcessing(payment.id);
      await this.publishBestEffort('payment.processing', processing);

      const result = await this.connector.initiate(payment);

      return await this.commitFinalState(payment.id, result.status ?? 'processing', {
        provider_reference: result.providerReference,
      }, result.providerReference, result.redirectUrl);
    } catch (error: any) {
      this.logger.error(`Échec orchestration pour payment=${payment.id}: ${error.message}`);
      return await this.commitFinalState(payment.id, 'failed', { reason: error.message });
    }
  }

  /**
   * Traite un webhook entrant provider (Flooz/Moov/CinetPay) : résout le
   * paiement via provider_reference, puis applique la même transaction
   * atomique que createPayment pour la transition finale.
   *
   * `provider` est déterminé sans ambiguïté par la route HTTP appelée
   * (/webhooks/flooz, /webhooks/moov, /webhooks/cinetpay) — voir
   * `ProviderWebhooksController`. Si l'adapter du provider est marqué
   * `confirmViaStatusCheck` (cas de CinetPay, dont le contenu du webhook
   * n'est pas jugé fiable par sa propre documentation), on ignore le statut
   * annoncé par le webhook et on rappelle activement `checkStatus()` comme
   * source de vérité avant toute transition.
   */
  async handleProviderWebhook(provider: ProviderName, payload: unknown): Promise<void> {
    const parsed = this.connector.parseWebhook(provider, payload);

    const payment = await this.payments.findByProviderReference(parsed.providerReference);
    if (!payment) {
      this.logger.warn(
        `Webhook provider reçu pour une référence inconnue: ${parsed.providerReference}`,
      );
      return;
    }

    let resolvedStatus: 'succeeded' | 'failed' | 'expired' = parsed.status;
    let rawPayload: unknown = parsed.raw;
    if (this.connector.requiresStatusConfirmation(provider)) {
      const confirmed = await this.connector.checkStatus(provider, parsed.providerReference);
      if (confirmed.status === 'processing') {
        // Toujours en attente côté provider : aucune transition à appliquer maintenant.
        this.logger.log(`Webhook ${provider} reçu mais statut encore 'processing' après re-check, payment=${payment.id}`);
        return;
      }
      resolvedStatus = confirmed.status;
      rawPayload = confirmed.raw;
    }

    const targetStatus: PaymentStatus = resolvedStatus === 'expired' ? 'failed' : resolvedStatus;
    await this.commitFinalState(payment.id, targetStatus, { provider_payload: rawPayload }, parsed.providerReference);
  }

  /**
   * Déclenche un remboursement : appel provider, puis transition atomique
   * statut + ledger d'inversion + événement.
   */
  async refundPayment(paymentId: string): Promise<Payment> {
    const payment = await this.payments.getPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} introuvable.`);
    }
    if (payment.status !== 'succeeded') {
      throw new BadRequestException(
        `Seul un paiement avec le statut "succeeded" peut être remboursé (statut actuel : ${payment.status}).`,
      );
    }

    const result = await this.connector.refund(payment);
    if (!result.success) {
      throw new UnprocessableEntityException(
        `Le provider a refusé le remboursement pour le paiement ${paymentId}.`,
      );
    }

    return this.commitFinalState(paymentId, 'refunded', {});
  }

  /**
   * Cœur de la correction de hardening : UNE transaction SQL pour statut +
   * ledger + outbox. C'est la seule façon d'écrire vers un état final dans
   * tout le système — ni PaymentsService, ni LedgerService, ni OutboxService
   * ne décident eux-mêmes d'enchaîner ces étapes.
   */
  private async commitFinalState(
    paymentId: string,
    status: PaymentStatus,
    eventPayload: Record<string, unknown>,
    providerReference?: string,
    redirectUrl?: string,
  ): Promise<Payment> {
    return this.db.withTransaction(async (client) => {
      const updated = await this.payments.applyFinalTransition(
        client,
        paymentId,
        status,
        eventPayload,
        providerReference,
        redirectUrl,
      );

      // Si la transition a été refusée par les garde-fous de PaymentsService
      // (déjà dans cet état, ou déjà dans un autre état final), `updated`
      // reflète l'état réel en base — on ne réécrit ni ledger ni outbox
      // pour une transition qui n'a, de fait, pas eu lieu.
      if (updated.status !== status) {
        return updated;
      }

      if (status === 'succeeded') {
        const providerAccount = providerLedgerAccount(updated.method);
        await this.ledger.writeEntries(client, {
          paymentId: updated.id,
          merchantId: updated.merchant_id,
          currency: updated.currency,
          reference: `payment:${updated.id}`,
          lines: this.ledger.buildSuccessEntries(updated.amount, providerAccount),
        });
      }

      if (status === 'refunded') {
        const providerAccount = providerLedgerAccount(updated.method);
        await this.ledger.writeEntries(client, {
          paymentId: updated.id,
          merchantId: updated.merchant_id,
          currency: updated.currency,
          reference: `refund:${updated.id}`,
          lines: this.ledger.buildRefundEntries(updated.amount, providerAccount),
        });
      }

      if (['succeeded', 'failed', 'expired', 'refunded'].includes(status)) {
        await this.outbox.recordInTransaction(
          client,
          `payment.${status}` as OutboxEventType,
          this.snapshot(updated),
          { paymentId: updated.id, merchantId: updated.merchant_id },
        );
      }

      return updated;
    });
  }

  /**
   * Publication best-effort (sa propre transaction, via OutboxService.record)
   * pour les événements non critiques (created/processing) : leur perte en
   * cas de crash n'a aucune conséquence financière, juste une traçabilité
   * légèrement incomplète. Ne JAMAIS utiliser ce chemin pour un état final.
   */
  private async publishBestEffort(eventType: OutboxEventType, payment: Payment): Promise<void> {
    try {
      await this.outbox.record(eventType, this.snapshot(payment), {
        paymentId: payment.id,
        merchantId: payment.merchant_id,
      });
    } catch (err: any) {
      this.logger.warn(`Publication best-effort échouée pour ${eventType} (payment=${payment.id}): ${err.message}`);
    }
  }

  private snapshot(payment: Payment) {
    return {
      id: payment.id,
      merchant_id: payment.merchant_id,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      provider_reference: payment.provider_reference,
    };
  }
}
