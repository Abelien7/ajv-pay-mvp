/**
 * Crée un marchand et affiche sa clé API en clair UNE SEULE FOIS
 * (elle n'est jamais stockée en clair en base — seul son hash l'est).
 *
 * Usage : node scripts/create-merchant.js "CBK Restaurant" cbk@example.com https://cbk.example.com/webhooks/ajvpay
 */
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function main() {
  const [name, email, webhookUrl] = process.argv.slice(2);
  if (!name) {
    console.error('Usage: node scripts/create-merchant.js "<nom>" [email] [webhook_url]');
    process.exit(1);
  }

  // Deux paires de clés d'un coup, comme POST /merchants/register (voir
  // migrations/009_sandbox_mode.sql) — la paire "test" ne touche jamais le
  // ledger, résolution instantanée via TestModeAdapter.
  const liveApiKey = `ajvpay_live_${crypto.randomBytes(24).toString('hex')}`;
  const liveHmacSecret = crypto.randomBytes(32).toString('hex');
  const testApiKey = `ajvpay_test_${crypto.randomBytes(24).toString('hex')}`;
  const testHmacSecret = crypto.randomBytes(32).toString('hex');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `INSERT INTO merchants (name, email, api_key_hash, hmac_secret, test_api_key_hash, test_hmac_secret, webhook_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      name,
      email ?? null,
      hashApiKey(liveApiKey),
      liveHmacSecret,
      hashApiKey(testApiKey),
      testHmacSecret,
      webhookUrl ?? null,
    ],
  );
  await pool.end();

  console.log('Marchand créé avec succès.');
  console.log('-----------------------------------------');
  console.log(`merchant_id      : ${rows[0].id}`);
  console.log(`Live API Key     : ${liveApiKey}   (à conserver, non récupérable ensuite)`);
  console.log(`Live HMAC Secret : ${liveHmacSecret}   (à conserver, non récupérable ensuite)`);
  console.log(`Test API Key     : ${testApiKey}   (à conserver, non récupérable ensuite)`);
  console.log(`Test HMAC Secret : ${testHmacSecret}   (à conserver, non récupérable ensuite)`);
  console.log('-----------------------------------------');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
