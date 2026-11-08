// A device proof (backend docs/04 §6): a compact JWS, ES256, typed `sotto-device-proof+jwt`, signed by this
// installation's key for one request. The header names the device (`kid`) or, when registering, carries the new key
// (`jwk`), never both. Claims: the method (`htm`, or HUB), the path or hub method (`htu`), `iat`, a single-use `jti`,
// and `ath`, the hash of the access token it travels with (RFC 9449).
import { createHash, randomBytes, sign, type KeyObject } from 'node:crypto';
import { Protocol } from '../../shared/contracts/sotto-contracts';
import type { PublicJwk } from './device-identity';

export interface ProofRequest {
  privateKey: KeyObject;
  /** The HTTP method, or `HUB` for a hub command. */
  htm: string;
  /** The request path (`/api/v1/devices/current`), or the hub method's C# name (`StartSession`). */
  htu: string;
  accessToken: string;
  kid?: string;
  jwk?: PublicJwk;
  nowMs?: number;
}

const b64url = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

export function signDeviceProof(request: ProofRequest): string {
  if (Boolean(request.kid) === Boolean(request.jwk)) {
    throw new Error('A proof names the device (kid) or carries the new key (jwk), never both.');
  }
  const header = {
    alg: 'ES256',
    typ: Protocol.DeviceProofType,
    ...(request.kid ? { kid: request.kid } : { jwk: request.jwk }),
  };
  const payload = {
    htm: request.htm,
    htu: request.htu,
    iat: Math.floor((request.nowMs ?? Date.now()) / 1000),
    jti: b64url(randomBytes(24)),
    ath: b64url(createHash('sha256').update(request.accessToken).digest()),
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // ES256 in a JWS is the raw r||s pair, not DER: ieee-p1363.
  const signature = sign('sha256', Buffer.from(input), { key: request.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(signature)}`;
}
