export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'refunded';
export type PaymentMethod = 'moov' | 'mixx' | 'manual';

export interface PaymentDto {
  id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider_reference: string | null;
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentListResponse {
  items: PaymentDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface MerchantMeResponse {
  id: string;
  name: string;
  email: string | null;
  webhook_url: string | null;
  balance: number;
  is_active: boolean;
}

export interface Credentials {
  apiBaseUrl: string;
  apiKey: string;
  hmacSecret: string;
}

export interface AdminCredentials {
  apiBaseUrl: string;
  adminKey: string;
}

export interface ManualPaymentProof {
  id: string;
  submitted_reference: string;
  note: string | null;
  created_at: string;
}

export interface PendingManualPayment {
  id: string;
  merchant_id: string;
  merchant_name: string;
  // Renvoyé en chaîne par Postgres (bigint) — jamais un number côté API.
  amount: string;
  currency: string;
  method: string;
  status: string;
  phone_number: string | null;
  metadata: { network?: 'moov' | 'mixx'; [key: string]: unknown } | null;
  created_at: string;
  proofs: ManualPaymentProof[];
}
