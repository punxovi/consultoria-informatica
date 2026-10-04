import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// IPC evita depender de taskkill/cmd para cerrar Astro y PostgreSQL en Windows.
export default async function iniciarServidor() {
  const servidor = fork(fileURLToPath(new URL('./programas-servidor.mjs', import.meta.url)), [], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), silent: true, execArgv: [],
  });
  let salida = '';
  for (const stream of [servidor.stdout, servidor.stderr]) {
    stream.on('data', datos => { salida = (salida + datos).slice(-20000); });
  }
  const terminado = new Promise(resolve => servidor.once('exit', resolve));
  async function cerrar() {
    if (servidor.exitCode !== null || servidor.signalCode !== null) return;
    if (servidor.connected) servidor.send({ tipo: 'cerrar' });
    const temporizador = setTimeout(() => servidor.kill(), 4000);
    try { await terminado; } finally { clearTimeout(temporizador); }
  }
  try {
    await new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => finalizar(new Error(`No se inició el servidor E2E.\n${salida}`)), 60000);
      const error = fallo => finalizar(fallo);
      const salir = codigo => finalizar(new Error(`El servidor E2E terminó (${codigo}).\n${salida}`));
      const mensaje = datos => { if (datos.tipo === 'listo') finalizar(); };
      function finalizar(fallo) {
        clearTimeout(temporizador);
        servidor.off('message', mensaje); servidor.off('error', error); servidor.off('exit', salir);
        if (fallo) reject(fallo); else resolve();
      }
      servidor.on('message', mensaje); servidor.once('error', error); servidor.once('exit', salir);
    });
    return cerrar;
  } catch (error) {
    await cerrar();
    throw error;
  }
}
