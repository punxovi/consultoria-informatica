import { createServer } from 'node:http';
import { dev } from 'astro';
import { crearBaseProgramas, comoUsuario, guardar } from './programas-db.mjs';
import { createProgramsServer } from '../../../backend/services/programs/src/server.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';

const db = await crearBaseProgramas();
const servidor = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4326');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  const responder = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  const token = req.headers.authorization;
  const rol = token === 'Bearer qa-admin' ? 'ADMIN' : token === 'Bearer qa-coord' ? 'COORD' : null;
  if (!rol) { responder(401, { message: 'Sesión requerida' }); return; }
  try {
    if (url.pathname === '/rest/v1/rpc/get_user_roles') {
      responder(200, [{ codigo: rol, alcance: 'global', id_pais: null }]); return;
    }
    if (url.pathname === '/rest/v1/rpc/guardar_programa_completo') {
      let cuerpo = ''; for await (const chunk of req) cuerpo += chunk;
      const datos = JSON.parse(cuerpo);
      responder(200, await guardar(db, datos.p_datos, datos.p_id_programa, datos.p_version_esperada, rol)); return;
    }
    const tabla = url.pathname.split('/').pop();
    if (req.method === 'GET' && ['programas', 'programa_lineas_accion'].includes(tabla)) {
      const id = url.searchParams.get('id_programa')?.replace(/^eq\./, '');
      const consulta = await comoUsuario(db, rol, tx => tx.query(
        `SELECT * FROM public.${tabla} WHERE archived_at IS NULL ${id ? 'AND id_programa = $1' : ''}
          ORDER BY ${tabla === 'programas' ? 'nombre, id_programa' : 'orden, created_at, id_linea_accion'}`,
        id ? [id] : [],
      ));
      responder(200, consulta.rows.map(fila => ({ ...fila, version: Number(fila.version) }))); return;
    }
    responder(404, { message: `Ruta de prueba no implementada: ${url.pathname}` });
  } catch (error) {
    responder(error.code === '42501' ? 403 : 400, { code: error.code, message: error.message, details: null, hint: null });
  }
});
await new Promise(resolve => servidor.listen(54329, '127.0.0.1', resolve));
process.env.PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54329';
process.env.PUBLIC_SUPABASE_ANON_KEY = 'qa-anon-key';
process.env.SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const programas = createProgramsServer();
await new Promise(resolve => programas.listen(4103, '127.0.0.1', resolve));
const gateway = createGatewayServer({
  allowedOrigins: ['http://127.0.0.1:4326'],
  targets: { programs: 'http://127.0.0.1:4103' },
});
await new Promise(resolve => gateway.listen(4000, '127.0.0.1', resolve));
const astro = await dev({ server: { host: '127.0.0.1', port: 4326 } });
let cerrando = false;
const cerrar = async () => {
  if (cerrando) return;
  cerrando = true;
  const salidaForzada = setTimeout(() => process.exit(0), 1500);
  salidaForzada.unref();
  servidor.closeAllConnections?.();
  gateway.closeAllConnections?.();
  programas.closeAllConnections?.();
  await astro.stop().catch(() => {});
  await Promise.all([
    new Promise(resolve => servidor.close(resolve)),
    new Promise(resolve => gateway.close(resolve)),
    new Promise(resolve => programas.close(resolve)),
  ]);
  await db.close().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
process.on('message', mensaje => { if (mensaje.tipo === 'cerrar') void cerrar(); });
process.on('disconnect', cerrar);
process.send?.({ tipo: 'listo' });
