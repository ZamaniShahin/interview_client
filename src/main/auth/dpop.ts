// DPoP (RFC 9449; backend Q44): the realm binds this sign-in's tokens to a key made for it, and every request carrying
// one (to Keycloak's token endpoint and to Sotto's API, the hub's handshake included) comes with a proof signed by
// that key. A token that leaves the app is useless without the key, so the key is kept like the refresh token:
// encrypted (SecretStore), and gone at sign-out. It is not the device key: replacing the device key (J4) must not end
// the sign-in.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  webcrypto,
  type KeyObject,
} from 'node:crypto';
import { Protocol } from '../../shared/contracts/sotto-contracts';
import type { SecretStore } from './secret-store';

export interface DpopPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface DpopKey {
  privateKey: KeyObject;
  publicJwk: DpopPublicJwk;
  /** The same key as WebCrypto keys, as openid-client's DPoP handle takes it. */
  cryptoKeyPair(): Promise<CryptoKeyPair>;
}

const secretName = 'dpop-key';

/** The key the sign-in's tokens are bound to: made at sign-in, kept with the refresh token, forgotten at sign-out. */
export class DpopKeys {
  private key: DpopKey | null = null;

  constructor(private readonly secrets: SecretStore) {}

  /** The current sign-in's key, made and stored if there is none (a sign-in from before DPoP, say). */
  async current(): Promise<DpopKey> {
    if (this.key) return this.key;
    const pem = await this.secrets.get(secretName);
    return pem ? (this.key = fromPrivateKey(createPrivateKey(pem))) : this.renew();
  }

  /** The key already loaded, for what can't wait for the store (it is loaded by every sign-in and refresh). */
  get loaded(): DpopKey | null {
    return this.key;
  }

  /** A key of its own for a new sign-in: tokens bound to the old one are done with. */
  async renew(): Promise<DpopKey> {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await this.secrets.set(secretName, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    return (this.key = fromPrivateKey(privateKey));
  }

  async forget(): Promise<void> {
    this.key = null;
    await this.secrets.delete(secretName);
  }
}

export interface DpopProofRequest {
  key: DpopKey;
  /** The request's method; `GET` for the hub's handshake. */
  htm: string;
  /** The request's URL. Its query and fragment are dropped, as RFC 9449 says. */
  htu: string | URL;
  /** The access token the request carries, hashed into `ath`. Absent for Keycloak's token endpoint. */
  accessToken?: string;
  nowMs?: number;
}

const b64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

/** A DPoP proof for one request: ES256, `typ` dpop+jwt, the public key in `jwk`, single use (`jti`). */
export function signDpopProof(request: DpopProofRequest): string {
  const url = new URL(request.htu);
  url.search = '';
  url.hash = '';
  const header = { alg: 'ES256', typ: Protocol.DpopProofType, jwk: request.key.publicJwk };
  const payload = {
    htm: request.htm,
    htu: url.href,
    iat: Math.floor((request.nowMs ?? Date.now()) / 1000),
    jti: b64url(randomBytes(24)),
    ...(request.accessToken ? { ath: b64url(createHash('sha256').update(request.accessToken).digest()) } : {}),
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // ES256 in a JWS is the raw r||s pair, not DER: ieee-p1363.
  const signature = sign('sha256', Buffer.from(input), { key: request.key.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(signature)}`;
}

function fromPrivateKey(privateKey: KeyObject): DpopKey {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) throw new Error('The DPoP key is not a P-256 key.');
  const publicJwk: DpopPublicJwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  let pair: Promise<CryptoKeyPair> | null = null;
  return {
    privateKey,
    publicJwk,
    cryptoKeyPair: () =>
      (pair ??= (async () => {
        const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
        const privateJwk = privateKey.export({ format: 'jwk' });
        // Node's WebCrypto types name more key usages than the DOM's CryptoKeyPair knows of; the keys are the same.
        return {
          privateKey: await webcrypto.subtle.importKey('jwk', privateJwk, algorithm, false, ['sign']),
          publicKey: await webcrypto.subtle.importKey('jwk', publicJwk, algorithm, true, ['verify']),
        } as unknown as CryptoKeyPair;
      })()),
  };
}
