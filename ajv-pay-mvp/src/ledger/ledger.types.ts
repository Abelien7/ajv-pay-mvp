export type LedgerAccount =
  | 'ajv_cash'
  | 'merchant_payable'
  | 'provider_moov'
  | 'provider_mixx'
  | 'provider_manual'
  | 'fees';

export type ProviderLedgerAccount = 'provider_moov' | 'provider_mixx' | 'provider_manual';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number; // en plus petite unité (ex: FCFA entier, pas de centimes pour XOF)
}
