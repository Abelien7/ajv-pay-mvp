import { LedgerService } from './ledger.service';
import { DatabaseService } from '../database/database.service';
import type { PoolClient } from 'pg';

function makeFakeClient(): PoolClient {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
}

describe('LedgerService.buildSuccessEntries', () => {
  const ledger = new LedgerService({} as DatabaseService);

  it("crédite le compte provider et débite merchant_payable pour le même montant", () => {
    const lines = ledger.buildSuccessEntries(1000, 'provider_moov');
    expect(lines).toEqual([
      { account: 'provider_moov', direction: 'credit', amount: 1000 },
      { account: 'merchant_payable', direction: 'debit', amount: 1000 },
    ]);
  });
});

describe('LedgerService.buildRefundEntries', () => {
  const ledger = new LedgerService({} as DatabaseService);

  it('inverse exactement les lignes du succès original', () => {
    const success = ledger.buildSuccessEntries(1000, 'provider_mixx');
    const refund = ledger.buildRefundEntries(1000, 'provider_mixx');

    expect(refund).toEqual([
      { account: 'provider_mixx', direction: 'debit', amount: 1000 },
      { account: 'merchant_payable', direction: 'credit', amount: 1000 },
    ]);

    // La somme des deux ensembles se neutralise bien par compte/direction.
    const net = (account: string, direction: 'debit' | 'credit') =>
      [...success, ...refund]
        .filter((l) => l.account === account && l.direction === direction)
        .reduce((sum, l) => sum + l.amount, 0);
    expect(net('provider_mixx', 'credit')).toBe(net('provider_mixx', 'debit'));
    expect(net('merchant_payable', 'credit')).toBe(net('merchant_payable', 'debit'));
  });
});

describe('LedgerService.writeEntries — dernière ligne de défense', () => {
  const ledger = new LedgerService({} as DatabaseService);

  it("accepte et écrit des lignes équilibrées (débit total = crédit total)", async () => {
    const client = makeFakeClient();
    const lines = ledger.buildSuccessEntries(5000, 'provider_moov');

    await ledger.writeEntries(client, {
      paymentId: 'pay-1',
      merchantId: 'merch-1',
      currency: 'XOF',
      reference: 'payment:pay-1',
      lines,
    });

    expect((client.query as jest.Mock).mock.calls.length).toBe(lines.length);
  });

  it('rejette des lignes déséquilibrées SANS écrire aucune ligne en base', async () => {
    const client = makeFakeClient();
    const unbalancedLines = [
      { account: 'provider_moov' as const, direction: 'credit' as const, amount: 1000 },
      { account: 'merchant_payable' as const, direction: 'debit' as const, amount: 999 },
    ];

    await expect(
      ledger.writeEntries(client, {
        paymentId: 'pay-2',
        merchantId: 'merch-1',
        currency: 'XOF',
        reference: 'payment:pay-2',
        lines: unbalancedLines,
      }),
    ).rejects.toThrow(/déséquilibré/);

    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejette un ensemble de lignes vide-mais-non-nul de façon cohérente (0 = 0 est autorisé)', async () => {
    const client = makeFakeClient();
    await ledger.writeEntries(client, {
      paymentId: 'pay-3',
      merchantId: 'merch-1',
      currency: 'XOF',
      reference: 'noop',
      lines: [],
    });
    expect(client.query).not.toHaveBeenCalled();
  });
});
