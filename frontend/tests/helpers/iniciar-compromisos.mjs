import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default async function iniciar() {
  const servidor = fork(fileURLToPath(new URL('./compromisos-servidor.mjs', import.meta.url)), [], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), silent: true, execArgv: ['--experimental-strip-types'],
  });
  let salida = '';
  for (const stream of [servidor.stdout, servidor.stderr]) stream.on('data', dato => { salida = (salida + dato).slice(-10000); });
  const terminado = new Promise(resolve => servidor.once('exit', resolve));
  async function cerrar() {
    if (servidor.exitCode !== null) return;
    if (servidor.connected) servidor.send('cerrar');
    const limite = setTimeout(() => servidor.kill(), 5000);
    try { await terminado; } finally { clearTimeout(limite); }
  }
  try {
    const urls = await new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error(salida || 'No se inició el entorno de Compromisos.')), 45000);
      servidor.once('message', mensaje => { clearTimeout(limite); resolve(mensaje); });
      servidor.once('exit', () => { clearTimeout(limite); reject(new Error(salida)); });
      servidor.once('error', error => { clearTimeout(limite); reject(error); });
    });
    process.env.QA_COMPROMISOS_GATEWAY = urls.gatewayUrl;
    process.env.QA_COMPROMISOS_SUPABASE = urls.supabaseUrl;
    return cerrar;
  } catch (error) { await cerrar(); throw error; }
}
