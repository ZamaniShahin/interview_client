// Secrets on disk, encrypted with Electron's safeStorage (DPAPI on Windows, the Keychain on macOS): only this OS user,
// on this computer, can read them back. Plain files would let anyone with the disk take over the sign-in.
// Electron 45's asynchronous API: the synchronous one is deprecated.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import type { SecretName, SecretStore } from './secret-store';

export class ElectronSecretStore implements SecretStore {
  private readonly dir = join(app.getPath('userData'), 'secrets');

  /** False when the OS offers no encryption: then nothing secret may be written (use MemorySecretStore). */
  static available(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable();
  }

  async get(name: SecretName): Promise<string | null> {
    let decrypted: Electron.DecryptStringAsyncReturnValue;
    try {
      decrypted = await safeStorage.decryptStringAsync(await readFile(this.path(name)));
    } catch {
      // Missing, or written by another OS user: either way there is nothing this user can use.
      return null;
    }
    // The OS key changed since this was written: write it again under the new one.
    if (decrypted.shouldReEncrypt) await this.set(name, decrypted.result).catch(() => {});
    return decrypted.result;
  }

  async set(name: SecretName, value: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    // Written beside, then moved over: a crash mid-write must not leave half a refresh token (that ends the sign-in).
    const path = this.path(name);
    await writeFile(`${path}.tmp`, await safeStorage.encryptStringAsync(value));
    await rename(`${path}.tmp`, path);
  }

  async delete(name: SecretName): Promise<void> {
    await rm(this.path(name), { force: true });
  }

  private path(name: SecretName): string {
    return join(this.dir, `${name}.bin`);
  }
}
