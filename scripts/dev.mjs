import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const backendEnv = join(root, 'backend', '.env');
if (existsSync(backendEnv)) loadEnvFile(backendEnv);

async function iniciarSupabaseLocalSiCorresponde() {
  const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? '';
  if (!/^https?:\/\/(localhost|127\.0\.0\.1):54321\b/i.test(url)) return;
  let running = false;
  try {
    const health = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { signal: AbortSignal.timeout(1500) });
    running = health.ok;
  } catch {}
  if (!running) {
    console.log('Iniciando Supabase local configurado por backend/.env…');
    await ejecutarSupabase(['start']);
  }
  console.log('Aplicando migraciones pendientes a Supabase local…');
  await ejecutarSupabase(['migration', 'up', '--local']);
}

function ejecutarSupabase(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('supabase', args, { cwd: root, env: process.env, stdio: 'inherit' });
    child.once('error', (error) => reject(new Error(`No se pudo ejecutar Supabase CLI. Inícialo manualmente con «supabase start». ${error.message}`)));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Supabase CLI ${args.join(' ')} terminó con código ${code}. Comprueba Docker y el SQL pendiente.`)));
  });
}

try {
  await iniciarSupabaseLocalSiCorresponde();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

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
  spawn(process.execPath, ['--experimental-strip-types', 'backend/services/organizations/src/main.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--experimental-strip-types', 'backend/services/programs/src/main.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--experimental-strip-types', 'backend/services/interventions/src/main.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--experimental-strip-types', 'backend/services/insights/src/main.ts'], {
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
