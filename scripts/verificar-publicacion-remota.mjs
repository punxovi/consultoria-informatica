// Diagnóstico de solo lectura. No imprime credenciales ni consulta registros reales.
import { loadEnvFile } from 'node:process';
import { createGatewayServer } from '../backend/gateway/src/server.ts';
import { createInterventionsServer } from '../backend/services/interventions/src/server.ts';

loadEnvFile(new URL('../backend/.env', import.meta.url));
const { SUPABASE_URL: url, SUPABASE_PUBLICATION_KEY: secret, SUPABASE_ANON_KEY: anon } = process.env;
if (!url || !secret || !anon) throw new Error('Falta configurar Supabase en backend/.env.');
const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
let failed = false;
function report(check, status, ok, extra = {}) {
  console.log(JSON.stringify({ check, status, ok, ...extra }));
  if (!ok) failed = true;
}
async function request(path, key, body) {
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (!key.startsWith('sb_')) headers.authorization = `Bearer ${key}`;
  const response = await fetch(new URL(path, url), {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  const data = await response.json().catch(() => null);
  const diagnostic = response.ok ? {} : {
    code: data?.code ?? data?.error ?? null,
    message: typeof data?.message === 'string'
      ? data.message.replaceAll(secret, '[redacted]').replaceAll(anon, '[redacted]').slice(0, 200) : null,
  };
  return { response, data, diagnostic };
}
const servers = [];
try {
  for (const [role, key] of [['backend', secret], ['anon', anon]]) {
    const { response, data, diagnostic } = await request('/rest/v1/rpc/obtener_archivo_evidencia_publicada', key, { p_id: missing });
    const ok = role === 'backend' ? response.ok && Array.isArray(data) && data.length === 0 : [401, 403].includes(response.status);
    report(`rpc-${role}`, response.status, ok, diagnostic);
  }
  const columns = {
    evidencias: 'id_evidencia,id_accion,bucket_id,ruta_objeto,nombre_original,mime_type,tamano_bytes,version,estado_publicacion,consentimiento_declarado,estado_carga,archived_at',
    acciones: 'id_accion,id_plan,archived_at', planes: 'id_plan,id_organizacion,archived_at',
    organizaciones: 'id_organizacion,archived_at',
  };
  for (const [table, fields] of Object.entries(columns)) {
    const { response, data, diagnostic } = await request(`/rest/v1/${table}?select=${fields}&limit=0`, secret);
    report(`permiso-lectura-${table}`, response.status, response.ok && Array.isArray(data) && data.length === 0, diagnostic);
  }
  const bucket = await request('/storage/v1/bucket/fge-evidencias', secret);
  report('bucket-privado', bucket.response.status, bucket.response.ok && bucket.data?.public === false, bucket.diagnostic);

  async function listen(server) {
    servers.push(server);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return new URL(`http://127.0.0.1:${server.address().port}`);
  }
  const service = await listen(createInterventionsServer());
  const gateway = await listen(createGatewayServer({ targets: { interventions: service } }));
  const response = await fetch(new URL(`/api/v1/public/evidences/${missing}/file`, gateway), { signal: AbortSignal.timeout(35_000) });
  const data = await response.json().catch(() => null);
  report('gateway-backend-supabase-inexistente', response.status,
    response.status === 404 && data?.error?.code === 'PUBLICACION_NO_ENCONTRADA');
} catch (error) {
  report('conexion', null, false, { code: error.cause?.code ?? error.code ?? error.name });
} finally {
  for (const server of servers.reverse()) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
if (failed) process.exitCode = 1;
