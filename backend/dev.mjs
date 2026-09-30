import { spawn } from 'node:child_process';

const procesos = [
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'gateway/src/main.ts'], {
    cwd: new URL('.', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch', '--experimental-strip-types', 'services/auth/src/main.ts'], {
    cwd: new URL('.', import.meta.url),
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
