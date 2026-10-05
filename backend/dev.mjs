import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const backendDirectory = fileURLToPath(new URL('.', import.meta.url));
const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) loadEnvFile(envFile);

const procesos = [
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'gateway/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/auth/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/organizations/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/programs/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/interventions/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/insights/src/main.ts'], {
    cwd: backendDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
];

let finalizando = false;

function finalizar(signal = 'SIGTERM') {
  if (finalizando) return;
  finalizando = true;
  for (const proceso of procesos) proceso.kill(signal);
}

for (const proceso of procesos) {
  proceso.on('exit', (codigo) => {
    if (!finalizando && codigo !== 0) {
      process.exitCode = codigo ?? 1;
      finalizar();
    }
  });
}

process.on('SIGINT', () => finalizar('SIGINT'));
process.on('SIGTERM', () => finalizar('SIGTERM'));
