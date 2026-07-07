export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'refunded';

export interface Payment {
  id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  method: 'moov' | 'mixx' | 'manual';
  phone_number: string | null;
  status: PaymentStatus;
  provider_reference: string | null;
  redirect_url: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}
