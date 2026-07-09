import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { Payment } from '../payments/payment.entity';

export interface ManualPaymentProof {
  id: string;
  payment_id: string;
  submitted_reference: string;
  note: string | null;
  created_at: Date;
}

export interface PendingManualPayment extends Payment {
  merchant_name: string;
  proofs: ManualPaymentProof[];
}

export type ManualNetwork = 'moov' | 'mixx';

export interface ManualNetworkInfo {
  number: string;
  /**
   * Gabarit de syntaxe USSD à composer, avec `{number}`/`{amount}` à
   * substituer par le numéro marchand et le montant réels, et `{pin}` à
   * remplacer par le CLIENT lui-même avec son propre code secret — AJV Pay
   * ne demande ni ne stocke jamais ce code. Absent du gabarit quand le
   * réseau ne l'inclut pas dans la syntaxe (ex: Mixx by Yas).
   */
  ussdTemplate: string;
}

/**
 * Accès DB pour le flux "paiement manuel vérifié à la main" : soumission de
 * preuve par le marchand (pour le compte de son client) et liste des
 * paiements en attente de revue pour l'admin plateforme. Les transitions de
 * statut elles-mêmes (confirmer/rejeter) restent dans PaymentOrchestrator —
 * ce service ne fait que lire/écrire les preuves, jamais le statut d'un
 * paiement.
 *
 * Un seul paiement 'manual' peut correspondre à L'UN OU L'AUTRE réseau
 * (Moov Money ou Mixx by Yas) — chacun a son propre numéro marchand et sa
 * propre syntaxe USSD (compositions différentes, voir `NETWORK_INFO`), donc
 * le réseau choisi par le client doit être transmis par l'appelant (Mavahi)
 * dans `metadata.network` à la création du paiement, plutôt que d'ajouter
 * une colonne dédiée pour une simple information d'affichage.
 */
@Injectable()
export class ManualPaymentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private readonly ussdTemplates: Record<ManualNetwork, string> = {
    moov: '*155*2*2*{number}*{amount}*{pin}',
    mixx: '*145*5*{amount}*{number}#',
  };

  getNetworkInfo(network: ManualNetwork): ManualNetworkInfo {
    const envVar = `MANUAL_PAYMENT_NUMBER_${network.toUpperCase()}`;
    return {
      number: this.config.get<string>(envVar, ''),
      ussdTemplate: this.ussdTemplates[network],
    };
  }

  getAllNetworksInfo(): Record<ManualNetwork, ManualNetworkInfo> {
    return {
      moov: this.getNetworkInfo('moov'),
      mixx: this.getNetworkInfo('mixx'),
    };
  }

  /**
   * Enregistre l'ID de transaction que le client a soumis. Le marchand
   * (Mavahi, etc.) appelle cette route pour le compte de son client — le
   * client final ne parle jamais directement à AJV Pay. Refuse si le
   * paiement n'appartient pas à ce marchand, n'est pas de méthode 'manual',
   * ou n'est plus en attente (déjà confirmé/rejeté).
   */
  async submitProof(paymentId: string, merchantId: string, reference: string, note?: string): Promise<void> {
    const { rows } = await this.db.query<Payment>(
      `SELECT * FROM payments WHERE id = $1 AND merchant_id = $2`,
      [paymentId, merchantId],
    );
    const payment = rows[0];
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} introuvable pour ce marchand.`);
    }
    if (payment.method !== 'manual') {
      throw new BadRequestException(`Payment ${paymentId} n'est pas de type "manual".`);
    }
    if (payment.status !== 'processing') {
      throw new BadRequestException(
        `Payment ${paymentId} a le statut "${payment.status}" — impossible de soumettre une preuve.`,
      );
    }

    await this.db.query(
      `INSERT INTO manual_payment_proofs (payment_id, submitted_reference, note) VALUES ($1, $2, $3)`,
      [paymentId, reference, note ?? null],
    );
  }

  /**
   * Paiements 'manual' en attente de revue, avec toutes les preuves
   * soumises (la plus récente en premier). `mode = 'live'` uniquement : un
   * paiement test (voir migrations/009_sandbox_mode.sql) est résolu
   * instantanément par TestModeAdapter et n'atteint jamais ce statut — le
   * filtre reste explicite ici en garde-fou, pour que cette file continue
   * de ne montrer QUE du vrai argent même si ce comportement changeait un jour.
   */
  async listPending(): Promise<PendingManualPayment[]> {
    const { rows } = await this.db.query<PendingManualPayment>(
      `SELECT p.*, m.name AS merchant_name,
              COALESCE(
                (SELECT json_agg(pr ORDER BY pr.created_at DESC)
                 FROM manual_payment_proofs pr WHERE pr.payment_id = p.id),
                '[]'
              ) AS proofs
       FROM payments p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.method = 'manual' AND p.status = 'processing' AND p.mode = 'live'
       ORDER BY p.created_at ASC`,
    );
    return rows;
  }
}
