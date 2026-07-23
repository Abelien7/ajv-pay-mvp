import { lookup } from 'dns/promises';
import { assertPublicWebhookUrl } from './ssrf-guard';

// `dns/promises` a des exports non reconfigurables — jest.spyOn() échoue
// avec "Cannot redefine property: lookup". jest.mock() (remplacement du
// module entier, résolu avant l'import) est la façon fiable de le mocker.
jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('assertPublicWebhookUrl', () => {
  afterEach(() => {
    mockedLookup.mockReset();
  });

  it('refuse une URL non https', async () => {
    await expect(assertPublicWebhookUrl('http://exemple.com/hook')).rejects.toThrow(/https/);
  });

  it.each([
    ['loopback IPv4', '127.0.0.1'],
    ['privé RFC 1918 (10.x)', '10.0.0.5'],
    ['privé RFC 1918 (172.16-31.x)', '172.20.0.5'],
    ['privé RFC 1918 (192.168.x)', '192.168.1.5'],
    ['link-local / métadonnées cloud', '169.254.169.254'],
    ['loopback IPv6', '::1'],
    ['link-local IPv6', 'fe80::1'],
    ['unique local IPv6', 'fd12:3456:789a::1'],
    ['IPv4 privée mappée en IPv6', '::ffff:10.0.0.5'],
  ])('refuse une URL https qui résout vers une IP interne (%s)', async (_label, address) => {
    mockedLookup.mockResolvedValue({ address, family: address.includes(':') ? 6 : 4 } as any);
    await expect(assertPublicWebhookUrl('https://exemple-interne.com/hook')).rejects.toThrow(/adresse interne/);
  });

  it('accepte une URL https qui résout vers une IP publique', async () => {
    mockedLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
    await expect(assertPublicWebhookUrl('https://exemple.com/hook')).resolves.toBeUndefined();
  });
});
