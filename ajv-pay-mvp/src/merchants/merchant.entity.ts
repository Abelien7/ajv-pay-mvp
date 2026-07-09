export interface Merchant {
  id: string;
  name: string;
  email: string | null;
  /** Clé "live" — paiements réels, écrits dans le ledger. */
  api_key_hash: string;
  hmac_secret: string;
  /** Clé "test" — paiements simulés, jamais de ledger, résolution instantanée (voir TestModeAdapter). */
  test_api_key_hash: string | null;
  test_hmac_secret: string | null;
  webhook_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type PaymentMode = 'live' | 'test';
