import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hash d'un mot de passe humain pour stockage en base (merchant_users.password_hash).
 * bcrypt (via bcryptjs, pur JS — évite les soucis de compilation native) est
 * délibérément lent : c'est ce qui protège un mot de passe à faible entropie
 * contre une attaque par force brute même si la base fuit un jour. Ne JAMAIS
 * utiliser cette fonction pour un jeton déjà aléatoire (voir hashApiKey dans
 * hmac.util.ts pour ce cas — un hash lent y serait un coût pur, sans bénéfice).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
