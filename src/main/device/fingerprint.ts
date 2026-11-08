// An opaque hash of machine identifiers, sent when registering (backend docs/04 §6). The server keeps only an HMAC of
// it, as a trial-abuse signal. On Windows it hashes the MachineGuid Windows makes at install; elsewhere, or when that
// can't be read, the host name, platform and CPU model, which are weaker but stable.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { arch, cpus, hostname, platform } from 'node:os';

export async function machineFingerprint(): Promise<string> {
  const machineGuid = platform() === 'win32' ? await readMachineGuid().catch(() => null) : null;
  const source = machineGuid ?? [hostname(), platform(), arch(), cpus()[0]?.model ?? ''].join('|');
  // Hashed here too, so the raw identifier never leaves the computer.
  return createHash('sha256').update(`sotto-device:${source}`).digest('hex');
}

function readMachineGuid(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { windowsHide: true, timeout: 5_000 },
      (error, stdout) => {
        const match = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(stdout ?? '');
        if (error || !match?.[1]) reject(error ?? new Error('No MachineGuid.'));
        else resolve(match[1]);
      },
    );
  });
}
