export interface Merchant {
  id: string;
  name: string;
  email: string | null;
  api_key_hash: string;
  hmac_secret: string;
  webhook_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
