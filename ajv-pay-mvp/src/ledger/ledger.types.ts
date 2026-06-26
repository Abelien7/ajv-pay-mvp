export type LedgerAccount =
  | 'ajv_cash'
  | 'merchant_payable'
  | 'provider_flooz'
  | 'provider_moov'
  | 'provider_cinetpay'
  | 'fees';

export type ProviderLedgerAccount = 'provider_flooz' | 'provider_moov' | 'provider_cinetpay';

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number; // en plus petite unité (ex: FCFA entier, pas de centimes pour XOF)
}
