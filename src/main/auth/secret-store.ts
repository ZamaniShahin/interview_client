// Secrets this computer keeps: the refresh token and the device's private key (README, "Token storage"). The Electron
// store encrypts them with the OS user's key before they touch the disk (electron-secret-store.ts); this file has no
// Electron in it, so the sign-in and device code can be tested in plain Node.
export type SecretName = 'refresh-token' | 'device-key' | 'device-id';

export interface SecretStore {
  get(name: SecretName): Promise<string | null>;
  set(name: SecretName, value: string): Promise<void>;
  delete(name: SecretName): Promise<void>;
}

/** Keeps secrets in memory only: for tests, and for a computer whose OS can't encrypt (then sign-in lasts a run). */
export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<SecretName, string>();

  async get(name: SecretName): Promise<string | null> {
    return this.values.get(name) ?? null;
  }

  async set(name: SecretName, value: string): Promise<void> {
    this.values.set(name, value);
  }

  async delete(name: SecretName): Promise<void> {
    this.values.delete(name);
  }
}
