/**
 * Provisionne un compte de connexion dashboard (merchant_users) pour un
 * marchand DÉJÀ EXISTANT — utile pour Mavahi et tout autre marchand créé
 * avant l'introduction du login dashboard (voir
 * migrations/010_merchant_dashboard_auth.sql). Les clés API live/test du
 * marchand ne sont pas touchées.
 *
 * Usage : node scripts/create-merchant-user.js <merchant_id> <email> <mot-de-passe>
 */
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const [merchantId, email, password] = process.argv.slice(2);
  if (!merchantId || !email || !password) {
    console.error('Usage: node scripts/create-merchant-user.js <merchant_id> <email> <mot-de-passe>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Le mot de passe doit contenir au moins 8 caractères.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `INSERT INTO merchant_users (merchant_id, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [merchantId, email, passwordHash],
  );
  await pool.end();

  console.log('Compte de connexion dashboard créé avec succès.');
  console.log('-----------------------------------------');
  console.log(`merchant_user_id : ${rows[0].id}`);
  console.log(`email            : ${email}`);
  console.log('-----------------------------------------');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
