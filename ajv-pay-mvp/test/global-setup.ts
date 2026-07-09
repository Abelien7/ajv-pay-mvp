import * as path from 'path';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

/**
 * Jest globalSetup : exécuté UNE SEULE FOIS avant toute la suite e2e, dans
 * un contexte Node séparé des workers de test. Rejoue les migrations
 * existantes (scripts/migrate.js, inchangé) contre la base ajvpay_test —
 * aucun nouveau mécanisme de schéma, on réutilise exactement le script de
 * prod/dev.
 */
export default async function globalSetup(): Promise<void> {
  const root = path.join(__dirname, '..');
  dotenv.config({ path: path.join(root, '.env.test') });

  execSync('node scripts/migrate.js', {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
}
