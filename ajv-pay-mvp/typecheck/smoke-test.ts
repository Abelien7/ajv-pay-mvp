/**
 * Smoke test runtime — exécuté avec `npx ts-node typecheck/smoke-test.ts`.
 *
 * Objectif : vérifier le comportement RÉEL (pas juste les types) des
 * fonctions financières les plus critiques, en l'absence de PostgreSQL et
 * de npm install (sandbox sans réseau). On mocke uniquement la couche SQL
 * (DatabaseService / PoolClient) — toute la logique métier testée ici est
 * le vrai code de production, pas une réécriture simplifiée.
 *
 * Ce n'est pas un remplacement à une vraie suite de tests (Jest), mais ça
 * valide pour la première fois que le code s'exécute et se comporte
 * comme attendu, au-delà du simple type-check.
 */
import { computeHmacSignature, safeCompare, hashApiKey } from '../src/common/auth/hmac.util';
import { LedgerService } from '../src/ledger/ledger.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PaymentEventsService } from '../src/events/payment-events.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PaymentOrchestrator } from '../src/orchestrator/payment-orchestrator.service';
import * as crypto from 'crypto';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

async function checkThrows(label: string, fn: () => Promise<any> | any) {
  try {
    await fn();
    failed++;
    console.error(`  ❌ ${label} (aucune exception levée)`);
  } catch {
    passed++;
    console.log(`  ✅ ${label}`);
  }
}

async function main() {
  // ---------------------------------------------------------
  // 1. HMAC — signature et comparaison à temps constant
  // ---------------------------------------------------------
  console.log('\n[1] HMAC util');
  {
    const secret = 'merchant-secret-key';
    const body = JSON.stringify({ amount: 5000, method: 'mixx' });

    const sig1 = computeHmacSignature(secret, body);
    const sig2 = computeHmacSignature(secret, body);
    const sigTampered = computeHmacSignature(secret, body + 'x');

    check('Signature déterministe (même input → même signature)', sig1 === sig2);
    check('Signature différente si le payload change', sig1 !== sigTampered);
    check('safeCompare accepte deux signatures identiques', safeCompare(sig1, sig2));
    check('safeCompare rejette deux signatures différentes', !safeCompare(sig1, sigTampered));
    check('hashApiKey est déterministe', hashApiKey('ajv_live_abc') === hashApiKey('ajv_live_abc'));
    check('hashApiKey ne renvoie jamais la clé en clair', !hashApiKey('ajv_live_abc').includes('ajv_live_abc'));
  }

  // ---------------------------------------------------------
  // 2. LedgerService — équilibre des écritures (partie double)
  // ---------------------------------------------------------
  console.log('\n[2] LedgerService — partie double');
  {
    const insertedRows: any[] = [];
    const fakeClient: any = {
      query: async (sql: string, params: any[]) => {
        insertedRows.push(params);
        return { rows: [], rowCount: 1 };
      },
    };
    const fakeDb: any = {
      withTransaction: async (fn: any) => fn(fakeClient),
    };

    const ledger = new LedgerService(fakeDb);

    // Cas valide : crédit/débit égaux
    insertedRows.length = 0;
    await ledger.writeEntries(fakeClient, {
      paymentId: 'p1',
      merchantId: 'm1',
      currency: 'XOF',
      reference: 'payment:p1',
      lines: ledger.buildSuccessEntries(5000, 'provider_mixx'),
    });
    check('2 lignes insérées pour un paiement réussi', insertedRows.length === 2);
    check(
      'Les deux lignes portent le même montant (5000)',
      insertedRows.every((row) => row[4] === 5000),
    );

    // Cas invalide : lignes déséquilibrées → doit lever une exception et NE
    // RIEN insérer (vérifié avant la boucle d'INSERT).
    insertedRows.length = 0;
    await checkThrows('writeEntries() rejette des lignes déséquilibrées', () =>
      ledger.writeEntries(fakeClient, {
        paymentId: 'p2',
        merchantId: 'm1',
        currency: 'XOF',
        reference: 'payment:p2',
        lines: [
          { account: 'provider_mixx', direction: 'credit', amount: 5000 },
          { account: 'merchant_payable', direction: 'debit', amount: 4000 }, // déséquilibré !
        ],
      }),
    );
    check('Aucune ligne insérée quand le ledger est déséquilibré', insertedRows.length === 0);

    // recordSuccess() / recordRefund() de haut niveau, via leur propre transaction
    insertedRows.length = 0;
    await ledger.recordSuccess({
      id: 'p3',
      merchant_id: 'm1',
      amount: 7500,
      currency: 'XOF',
      method: 'moov',
    } as any);
    check('recordSuccess() utilise le compte provider_moov pour method=moov', insertedRows[0][2] === 'provider_moov');
  }

  // ---------------------------------------------------------
  // 3. IdempotencyService — replay vs conflit
  // ---------------------------------------------------------
  console.log('\n[3] IdempotencyService');
  {
    const idempotency = new IdempotencyService({} as any);

    // Cas 1 : pas de ligne existante → réservation
    {
      const fakeClient: any = {
        query: async (sql: string) => {
          if (sql.includes('SELECT request_hash')) return { rows: [] };
          return { rows: [] }; // INSERT ... ON CONFLICT DO NOTHING
        },
      };
      const result = await idempotency.checkAndReserve(fakeClient, 'm1', 'key-1', { amount: 5000 });
      check('Première utilisation d’une clé → isReplay = false', result.isReplay === false);
    }

    // Cas 2 : ligne existante avec le MÊME hash → replay, renvoie la réponse stockée
    {
      const payload = { amount: 5000 };
      const sameHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const fakeClient: any = {
        query: async (sql: string) => {
          if (sql.includes('SELECT request_hash')) {
            return { rows: [{ request_hash: sameHash, response: { id: 'p-existing' } }] };
          }
          return { rows: [] };
        },
      };
      const result = await idempotency.checkAndReserve(fakeClient, 'm1', 'key-2', payload);
      check('Même payload + même clé → isReplay = true', result.isReplay === true);
      check('La réponse existante est bien renvoyée', result.existingResponse?.id === 'p-existing');
    }

    // Cas 3 : ligne existante avec un hash DIFFÉRENT → conflit (doit lever une exception)
    await checkThrows('Même clé + payload différent → exception (conflit)', async () => {
      const fakeClient: any = {
        query: async (sql: string) => {
          if (sql.includes('SELECT request_hash')) {
            return { rows: [{ request_hash: 'un-hash-totalement-different', response: {} }] };
          }
          return { rows: [] };
        },
      };
      await idempotency.checkAndReserve(fakeClient, 'm1', 'key-3', { amount: 9999 });
    });
  }

  // ---------------------------------------------------------
  // 4. PaymentOrchestrator — atomicité statut + ledger + outbox
  //    (correction suite à la Production Hardening Checklist)
  // ---------------------------------------------------------
  console.log('\n[4] PaymentOrchestrator — transaction atomique finale');
  {
    let transactionCount = 0;
    const queryLog: string[] = [];

    const existingPayment = {
      id: 'p-webhook',
      merchant_id: 'm1',
      amount: 5000,
      currency: 'XOF',
      method: 'mixx',
      phone_number: '+22890000000',
      status: 'processing',
      provider_reference: 'mixx-ref-1',
      idempotency_key: 'key-1',
      metadata: null,
    };

    const fakeClient: any = {
      query: async (sql: string) => {
        queryLog.push(sql.trim().split('\n')[0]);
        if (sql.includes('FOR UPDATE')) return { rows: [existingPayment] };
        if (sql.startsWith('UPDATE payments')) {
          return { rows: [{ ...existingPayment, status: 'succeeded' }] };
        }
        if (sql.startsWith('INSERT INTO outbox_events')) {
          return { rows: [{ id: 'evt-1' }] };
        }
        return { rows: [] };
      },
    };

    const fakeDb: any = {
      query: async (sql: string) => {
        if (sql.includes('provider_reference')) return { rows: [existingPayment] };
        return { rows: [] };
      },
      withTransaction: async (fn: any) => {
        transactionCount++;
        return fn(fakeClient);
      },
    };

    const fakeConnector: any = {
      parseWebhook: () => ({
        providerReference: 'mixx-ref-1',
        status: 'succeeded',
        raw: { transaction_id: 'mixx-ref-1' },
      }),
      requiresStatusConfirmation: () => false,
    };

    const paymentsService = new PaymentsService(fakeDb, {} as any, new PaymentEventsService());
    const ledgerService = new LedgerService(fakeDb);
    const outboxService = new OutboxService(fakeDb);
    const orchestrator = new PaymentOrchestrator(
      fakeDb,
      paymentsService,
      fakeConnector,
      ledgerService,
      outboxService,
    );

    await orchestrator.handleProviderWebhook('mixx', { transaction_id: 'mixx-ref-1', status: 'SUCCESS' });

    check('Une seule transaction SQL ouverte pour toute la transition finale', transactionCount === 1);
    check(
      'Le statut est mis à jour DANS cette transaction',
      queryLog.some((q) => q.startsWith('UPDATE payments')),
    );
    check(
      'Le ledger est écrit DANS la même transaction (2 lignes)',
      queryLog.filter((q) => q.startsWith('INSERT INTO ledger_entries')).length === 2,
    );
    check(
      "L'événement outbox est publié DANS la même transaction",
      queryLog.some((q) => q.startsWith('INSERT INTO outbox_events')),
    );
    check(
      'payment_events est aussi journalisé dans cette transaction',
      queryLog.some((q) => q.startsWith('INSERT INTO payment_events')),
    );
  }

  // ---------------------------------------------------------
  console.log(`\n--- Résultat : ${passed} succès, ${failed} échecs ---`);
  return failed;
}

main().then((failedCount) => {
  if (failedCount > 0) {
    throw new Error(`${failedCount} test(s) en échec`);
  }
});

