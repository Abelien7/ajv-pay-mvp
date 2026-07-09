import { computeHmacSignature, hashApiKey, safeCompare } from './hmac.util';

describe('hashApiKey', () => {
  it('produit un hash SHA-256 déterministe (64 caractères hex)', () => {
    const hash = hashApiKey('ajvpay_secret123');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey('ajvpay_secret123')).toBe(hash);
  });

  it('produit des hashs différents pour des clés différentes', () => {
    expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'));
  });
});

describe('computeHmacSignature', () => {
  it('est déterministe pour un même secret et payload', () => {
    const sig1 = computeHmacSignature('secret', '{"amount":100}');
    const sig2 = computeHmacSignature('secret', '{"amount":100}');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('change si le payload est altéré (détection de falsification)', () => {
    const original = computeHmacSignature('secret', '{"amount":100}');
    const tampered = computeHmacSignature('secret', '{"amount":100000}');
    expect(tampered).not.toBe(original);
  });

  it('change si le secret est différent', () => {
    const sigA = computeHmacSignature('secret-a', '{"amount":100}');
    const sigB = computeHmacSignature('secret-b', '{"amount":100}');
    expect(sigA).not.toBe(sigB);
  });
});

describe('safeCompare', () => {
  it('retourne true pour deux chaînes identiques', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
  });

  it('retourne false pour deux chaînes différentes de même longueur', () => {
    expect(safeCompare('abc123', 'abc124')).toBe(false);
  });

  it('retourne false pour deux chaînes de longueurs différentes (sans throw)', () => {
    expect(safeCompare('abc', 'abcdef')).toBe(false);
  });

  it('retourne false pour une chaîne vide comparée à une non-vide', () => {
    expect(safeCompare('', 'x')).toBe(false);
  });
});
