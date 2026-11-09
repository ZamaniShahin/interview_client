// Builds the client's oidc.ts as main builds it (CommonJS, openid-client and its dependencies inlined), then runs the
// bundle in Node against Keycloak: discovery, an authorization URL, and a refused refresh token. It checked 1.10's
// choice to bundle openid-client (ES modules only) into main (CommonJS); the local stack must be running.
//   node scripts/oidc-cjs-check.mjs . http://localhost:8080/realms/sotto <a new, empty outDir>
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [clientDir, issuer, outDir] = process.argv.slice(2);
const { build } = await import(pathToFileURL(join(clientDir, 'node_modules/vite/dist/node/index.js')).href);

await build({
  root: clientDir,
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: join(clientDir, 'src/main/auth/oidc.ts'),
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'oidc.cjs' } },
  },
  ssr: { noExternal: ['openid-client', 'jose', 'oauth4webapi'] },
});

const require = createRequire(import.meta.url);
const bundlePath = join(outDir, 'oidc.cjs');
const bundled = require('node:fs').readFileSync(bundlePath, 'utf8');
console.log('bundle requires:', [...new Set(bundled.match(/require\("[^"]+"\)/g) ?? [])].join(' '));

const { OpenIdClient, SignInExpired } = require(bundlePath);
const client = new OpenIdClient({
  issuer,
  clientId: 'desktop',
  scopes: 'openid email profile offline_access',
  allowHttp: true,
});

const { url } = await client.authorizationUrl('http://127.0.0.1:50123/callback');
const parsed = new URL(url);
console.log('authorization endpoint:', parsed.origin + parsed.pathname);
console.log(
  'parameters:',
  [...parsed.searchParams.keys()].join(', '),
  '| method:',
  parsed.searchParams.get('code_challenge_method'),
);

try {
  await client.refresh('not-a-real-refresh-token');
  console.log('refresh: accepted (unexpected)');
} catch (error) {
  console.log(
    'refresh with a bad token:',
    error instanceof SignInExpired ? 'SignInExpired' : `${error.constructor.name}: ${error.message}`,
  );
}
