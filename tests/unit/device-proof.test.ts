import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemorySecretStore } from '../../src/main/auth/secret-store';
import { DeviceIdentity } from '../../src/main/device/device-identity';
import { signDeviceProof } from '../../src/main/device/proof';
import { Protocol } from '../../src/shared/contracts/sotto-contracts';

/** Reads a compact JWS back, independently of the code that made it. */
function decode(proof: string) {
  const [header, payload, signature] = proof.split('.');
  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<string, unknown>,
    input: `${header}.${payload}`,
    signature: Buffer.from(signature!, 'base64url'),
  };
}

async function deviceKey() {
  return new DeviceIdentity(new MemorySecretStore()).keyPair();
}

describe('a device proof', () => {
  it('is an ES256 JWS, signed by the device key, that its public half verifies', async () => {
    const key = await deviceKey();
    const proof = signDeviceProof({
      privateKey: key.privateKey,
      htm: 'GET',
      htu: '/api/v1/devices/current',
      accessToken: 'access-token',
      kid: 'device-1',
      nowMs: 1_762_600_000_789,
    });

    const { header, payload, input, signature } = decode(proof);
    expect(header).toEqual({ alg: 'ES256', typ: Protocol.DeviceProofType, kid: 'device-1' });
    expect(payload).toMatchObject({ htm: 'GET', htu: '/api/v1/devices/current', iat: 1_762_600_000 });
    // A JWS carries the raw r||s pair, 64 bytes for P-256, not DER.
    expect(signature).toHaveLength(64);
    const publicKey = createPublicKey({ key: { ...key.publicJwk }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(input), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)).toBe(true);
  });

  it('is bound to the access token it travels with', async () => {
    const key = await deviceKey();
    const proof = signDeviceProof({ privateKey: key.privateKey, htm: 'HUB', htu: 'StartSession', accessToken: 'access-token', kid: 'd' });

    const expected = createHash('sha256').update('access-token').digest('base64url');
    expect(decode(proof).payload['ath']).toBe(expected);
  });

  it('carries a new single-use id each time', async () => {
    const key = await deviceKey();
    const make = () => decode(signDeviceProof({ privateKey: key.privateKey, htm: 'GET', htu: '/x', accessToken: 't', kid: 'd' }));

    const first = make().payload['jti'] as string;
    const second = make().payload['jti'] as string;
    expect(first).not.toBe(second);
    // The server takes 16 to 128 characters.
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(first.length).toBeLessThanOrEqual(128);
  });

  it('carries the new public key, and no device id, when registering', async () => {
    const key = await deviceKey();
    const proof = signDeviceProof({
      privateKey: key.privateKey,
      htm: 'POST',
      htu: '/api/v1/devices',
      accessToken: 't',
      jwk: key.publicJwk,
    });

    const { header } = decode(proof);
    expect(header['jwk']).toEqual(key.publicJwk);
    expect(header).not.toHaveProperty('kid');
  });

  it('names the device or carries the key: never both, never neither', async () => {
    const key = await deviceKey();
    const base = { privateKey: key.privateKey, htm: 'GET', htu: '/x', accessToken: 't' };

    expect(() => signDeviceProof({ ...base, kid: 'd', jwk: key.publicJwk })).toThrow();
    expect(() => signDeviceProof(base)).toThrow();
  });
});

describe("this installation's device identity", () => {
  it('keeps one key across restarts', async () => {
    const secrets = new MemorySecretStore();
    const first = await new DeviceIdentity(secrets).keyPair();
    const second = await new DeviceIdentity(secrets).keyPair();

    expect(second.publicJwk).toEqual(first.publicJwk);
  });

  it('makes a new key, and forgets its id, once told to forget', async () => {
    const identity = new DeviceIdentity(new MemorySecretStore());
    const first = await identity.keyPair();
    await identity.remember('device-1');

    await identity.forget();

    expect(await identity.id()).toBeNull();
    expect((await identity.keyPair()).publicJwk).not.toEqual(first.publicJwk);
  });
});
