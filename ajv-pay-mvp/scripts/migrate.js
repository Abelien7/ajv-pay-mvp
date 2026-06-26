/**
 * Script de migration minimaliste pour le MVP.
 * Exécute tous les fichiers .sql du dossier /migrations, dans l'ordre alphabétique,
 * et journalise ceux déjà appliqués dans une table schema_migrations.
 *
 * Usage : npm run migrate
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file],
      );
      if (rows.length > 0) {
        console.log(`[skip] ${file} déjà appliquée`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      console.log(`[run]  ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[ok]   ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration échouée :', err);
  process.exit(1);
});
