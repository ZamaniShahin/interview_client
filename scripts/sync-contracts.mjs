// Copies the hub's contract from the backend repository, where it is generated from Sotto.Contracts, into
// src/shared/contracts/. The client never edits it by hand: a renamed field there is a protocol change.
//   npm run contracts:sync    copy it
//   npm run contracts:check   fail if the copy differs (CI, and before a release)
// The backend is expected next to this repository (../backend/interview_backend); SOTTO_BACKEND overrides it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = process.env.SOTTO_BACKEND ?? resolve(root, '..', 'backend', 'interview_backend');
const source = resolve(backend, 'contracts', 'sotto-contracts.ts');
const target = resolve(root, 'src', 'shared', 'contracts', 'sotto-contracts.ts');
const check = process.argv.includes('--check');

if (!existsSync(source)) {
  console.error(`The backend's contract isn't at ${source}. Set SOTTO_BACKEND to the backend repository.`);
  process.exit(2);
}

const wanted = readFileSync(source, 'utf8');
const current = existsSync(target) ? readFileSync(target, 'utf8') : null;

if (check) {
  if (current !== wanted) {
    console.error('src/shared/contracts/sotto-contracts.ts differs from the backend: run npm run contracts:sync.');
    process.exit(1);
  }
  console.log('The contract matches the backend.');
} else if (current === wanted) {
  console.log('The contract is already up to date.');
} else {
  writeFileSync(target, wanted);
  console.log('The contract was copied from the backend. Type-check and test before committing.');
}
