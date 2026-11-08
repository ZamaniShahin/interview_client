// This installation's identity: an ECDSA P-256 key made here and never sent anywhere (only its public half travels,
// once, at registration), and the device id the server gave it. Tokens copied elsewhere are useless without the key
// (backend docs/04 §6).
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { SecretStore } from '../auth/secret-store';

export interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface DeviceKey {
  privateKey: KeyObject;
  publicJwk: PublicJwk;
}

export class DeviceIdentity {
  private key: DeviceKey | null = null;

  constructor(private readonly secrets: SecretStore) {}

  /** The key, made and stored the first time it is needed. */
  async keyPair(): Promise<DeviceKey> {
    if (this.key) return this.key;
    const pem = await this.secrets.get('device-key');
    if (pem) {
      this.key = fromPrivateKey(createPrivateKey(pem));
    } else {
      const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      await this.secrets.set('device-key', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
      this.key = fromPrivateKey(privateKey);
    }
    return this.key;
  }

  id(): Promise<string | null> {
    return this.secrets.get('device-id');
  }

  remember(id: string): Promise<void> {
    return this.secrets.set('device-id', id);
  }

  /** After `device_key_revoked`: a removed key can never come back, so the next registration makes a new one. */
  async forget(): Promise<void> {
    this.key = null;
    await this.secrets.delete('device-key');
    await this.secrets.delete('device-id');
  }
}

function fromPrivateKey(privateKey: KeyObject): DeviceKey {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('The device key is not a P-256 key.');
  return { privateKey, publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
}
