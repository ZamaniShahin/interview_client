import { createHash, createPublicKey, verify, webcrypto, type JsonWebKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DpopKeys, signDpopProof, type DpopKey } from '../../src/main/auth/dpop';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { Protocol } from '../../src/shared/contracts/sotto-contracts';

function parts(proof: string) {
  const [header, payload, signature] = proof.split('.');
  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>,
    input: `${header}.${payload}`,
    signature: Buffer.from(signature!, 'base64url'),
  };
}

const verifies = (proof: string, key: DpopKey): boolean => {
  const { input, signature } = parts(proof);
  const publicKey = createPublicKey({ key: { ...key.publicJwk } as JsonWebKey, format: 'jwk' });
  return verify('sha256', Buffer.from(input), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
};

describe('the sign-in key (DPoP, Q44)', () => {
  it('is made and stored the first time, then the same key comes back', async () => {
    const secrets = new MemorySecretStore();
    const keys = new DpopKeys(secrets);

    const first = await keys.current();
    const again = await keys.current();

    expect(again).toBe(first);
    expect(await secrets.get('dpop-key')).toContain('PRIVATE KEY');
    expect(first.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(first.publicJwk).not.toHaveProperty('d');
  });

  it('comes back from the store in a new run of the app', async () => {
    const secrets = new MemorySecretStore();
    const before = await new DpopKeys(secrets).current();

    const after = await new DpopKeys(secrets).current();

    expect(after.publicJwk).toEqual(before.publicJwk);
  });

  it('is replaced by a new one for a new sign-in', async () => {
    const secrets = new MemorySecretStore();
    const keys = new DpopKeys(secrets);
    const old = await keys.current();

    const renewed = await keys.renew();

    expect(renewed.publicJwk).not.toEqual(old.publicJwk);
    expect((await new DpopKeys(secrets).current()).publicJwk).toEqual(renewed.publicJwk);
  });

  it('is forgotten at sign-out, here and in the store', async () => {
    const secrets = new MemorySecretStore();
    const keys = new DpopKeys(secrets);
    const old = await keys.current();

    await keys.forget();

    expect(keys.loaded).toBeNull();
    expect(await secrets.get('dpop-key')).toBeNull();
    expect((await keys.current()).publicJwk).not.toEqual(old.publicJwk);
  });

  it('is the same key as WebCrypto keys, for openid-client', async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();
    const pair = await key.cryptoKeyPair();
    const data = new TextEncoder().encode('proof input');

    const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey as webcrypto.CryptoKey, data);

    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey as webcrypto.CryptoKey, signature, data)).toBe(true);
    expect(await webcrypto.subtle.exportKey('jwk', pair.publicKey as webcrypto.CryptoKey)).toMatchObject(key.publicJwk);
    expect(pair.privateKey.extractable).toBe(false);
    expect(await key.cryptoKeyPair()).toBe(pair);
  });
});

describe('a DPoP proof', () => {
  it("carries the key, is typed dpop+jwt and is signed by the key's private half", async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();

    const proof = signDpopProof({ key, htm: 'GET', htu: 'https://api.sotto.test/api/v1/me', accessToken: 'the-token' });

    const { header } = parts(proof);
    expect(header).toEqual({ alg: 'ES256', typ: Protocol.DpopProofType, jwk: key.publicJwk });
    expect(verifies(proof, key)).toBe(true);
  });

  it('names the request, the moment and the token, once', async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();

    const proof = signDpopProof({ key, htm: 'POST', htu: 'https://api.sotto.test/api/v1/devices', accessToken: 'the-token', nowMs: 1_700_000_000_999 });

    expect(parts(proof).payload).toEqual({
      htm: 'POST',
      htu: 'https://api.sotto.test/api/v1/devices',
      iat: 1_700_000_000,
      jti: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) as unknown,
      ath: createHash('sha256').update('the-token').digest('base64url'),
    });
  });

  it.each([
    ['https://api.sotto.test/api/v1/me?x=1', 'https://api.sotto.test/api/v1/me'],
    ['https://api.sotto.test/api/v1/me#top', 'https://api.sotto.test/api/v1/me'],
    ['https://api.sotto.test/hubs/live?pv=1', 'https://api.sotto.test/hubs/live'],
    ['http://localhost:5180/api/v1/me', 'http://localhost:5180/api/v1/me'],
  ])('drops the query and the fragment from %s', async (url, htu) => {
    const key = await new DpopKeys(new MemorySecretStore()).current();

    expect(parts(signDpopProof({ key, htm: 'GET', htu: url, accessToken: 't' })).payload['htu']).toBe(htu);
    expect(parts(signDpopProof({ key, htm: 'GET', htu: new URL(url), accessToken: 't' })).payload['htu']).toBe(htu);
  });

  it('has no ath when no access token goes with it (Keycloak’s token endpoint)', async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();

    expect(parts(signDpopProof({ key, htm: 'POST', htu: 'http://localhost:8080/token' })).payload).not.toHaveProperty('ath');
  });

  it('is never the same twice', async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();
    const proofs = Array.from({ length: 50 }, () => signDpopProof({ key, htm: 'GET', htu: 'http://api.test/x', accessToken: 't', nowMs: 0 }));

    expect(new Set(proofs.map((p) => parts(p).payload['jti'])).size).toBe(50);
  });

  it("doesn't verify with another key", async () => {
    const key = await new DpopKeys(new MemorySecretStore()).current();
    const other = await new DpopKeys(new MemorySecretStore()).current();

    expect(verifies(signDpopProof({ key, htm: 'GET', htu: 'http://api.test/x', accessToken: 't' }), other)).toBe(false);
  });
});
