/**
 * Interface commune que chaque provider (Moov Money, Mixx by Yas, plus le
 * provider "manual" — vérification humaine) doit implémenter. Le code
 * métier (PaymentsService) ne dépend jamais d'un provider concret,
 * uniquement de cette interface — c'est ce qui permet d'ajouter un nouveau
 * provider en ajoutant un seul fichier adapter, sans toucher à
 * `PaymentsService` ni à `PaymentOrchestrator`.
 */
export type ProviderName = 'moov' | 'mixx' | 'manual' | 'cinetpay';

export interface InitiateParams {
  paymentId: string;
  amount: number;
  currency: string;
  phoneNumber: string;
}

export interface InitiateResult {
  /** Référence externe attribuée par le provider, à stocker dans payments.provider_reference */
  providerReference: string;
  /** Si le provider répond de façon synchrone avec un statut définitif */
  status?: 'processing' | 'succeeded' | 'failed';
  /** Présent pour les providers à redirection (carte) : URL où rediriger le client pour payer. */
  redirectUrl?: string;
}

export interface StatusResult {
  status: 'processing' | 'succeeded' | 'failed' | 'expired';
  providerReference: string;
  raw?: unknown;
}

export interface WebhookParseResult {
  providerReference: string;
  status: 'succeeded' | 'failed' | 'expired';
  raw: unknown;
}

export interface PaymentProviderAdapter {
  readonly name: ProviderName;

  /**
   * `true` si le contenu du webhook de ce provider ne doit jamais être
   * considéré comme fiable par lui-même — dans ce cas, `PaymentOrchestrator`
   * rappelle systématiquement `checkStatus()` après `parseWebhook()` et
   * utilise son résultat comme source de vérité.
   */
  readonly confirmViaStatusCheck?: boolean;

  /** Déclenche le paiement côté provider (ex : push USSD vers le téléphone du client, ou lien de paiement carte). */
  initiate(params: InitiateParams): Promise<InitiateResult>;

  /** Interroge activement le provider sur le statut d'une transaction (polling de secours). */
  checkStatus(providerReference: string): Promise<StatusResult>;

  /** Interprète un payload de webhook entrant envoyé par le provider. */
  parseWebhook(payload: unknown): WebhookParseResult;

  /** Initie un remboursement côté provider, si l'API du provider le permet. */
  refund(providerReference: string, amount: number): Promise<{ success: boolean }>;

  /**
   * Vérifie l'authenticité d'un webhook entrant à partir du corps brut et
   * des headers HTTP. Retourne `true` si le webhook est authentique, `false`
   * sinon. Un adapter qui n'implémente pas cette méthode (retourne
   * `undefined`) est considéré comme "vérification non configurée" — voir
   * le traitement explicite (et le log d'avertissement) dans
   * `ProviderWebhooksController`.
   */
  verifyWebhookSignature?(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean | undefined;
}
