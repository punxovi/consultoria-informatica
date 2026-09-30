import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const backendEnv = join(root, 'backend', '.env');
if (existsSync(backendEnv)) loadEnvFile(backendEnv);
const processes = [
  spawn(process.execPath, ['--experimental-strip-types', 'backend/gateway/src/main.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--experimental-strip-types', 'backend/services/auth/src/main.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'dev'], {
    cwd: join(root, 'frontend'),
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill(signal);
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!stopping && code !== 0) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
