export type LedgerAccount =
  | 'ajv_cash'
  | 'merchant_payable'
  | 'provider_moov'
  | 'provider_mixx'
  | 'provider_manual'
  | 'provider_cinetpay'
  | 'fees';

export type ProviderLedgerAccount = 'provider_moov' | 'provider_mixx' | 'provider_manual' | 'provider_cinetpay';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number; // en plus petite unité (ex: FCFA entier, pas de centimes pour XOF)
}
