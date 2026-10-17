// Ejecuta la prueba real y oculta credenciales incluso en errores de Playwright.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = {};
for (const path of ['backend/.env', 'backend/.env.qa']) {
  const absolute = join(root, path);
  if (existsSync(absolute)) Object.assign(config, parseEnv(readFileSync(absolute, 'utf8')));
}
const environment = { ...process.env, ...config, EVIDENCIAS_SUPABASE_REAL: '1' };
const secrets = ['QA_ACCESS_TOKEN', 'SUPABASE_PUBLICATION_KEY', 'SUPABASE_ANON_KEY']
  .map(key => environment[key]).filter(Boolean);
function redact(text) {
  for (const secret of secrets) text = text.replaceAll(secret, '[credencial oculta]');
  return text.replace(/Bearer\s+[A-Za-z0-9_.\-]+/gi, 'Bearer [credencial oculta]');
}
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const cli = join(dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
const child = spawn(process.execPath, [cli, 'test', '--config', 'playwright.evidencias-integracion.config.mjs'], {
  cwd: join(root, 'frontend'), env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    const end = pending.lastIndexOf('\n');
    if (end !== -1) { target.write(redact(pending.slice(0, end + 1))); pending = pending.slice(end + 1); }
  });
  stream.on('end', () => { if (pending) target.write(redact(pending)); });
}
child.on('error', error => { console.error(redact(error.message)); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
