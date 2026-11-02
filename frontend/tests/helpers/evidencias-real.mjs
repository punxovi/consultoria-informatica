// Conecta los servicios locales a Supabase real. No modifica ni resetea el esquema.
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';
import { createInterventionsServer } from '../../../backend/services/interventions/src/server.ts';
import { createAuthServer } from '../../../backend/services/auth/src/server.ts';

export async function crearEntornoEvidenciasReal({origin='http://127.0.0.1:4335'}={}) {
  for(const path of ['../../../backend/.env','../../../backend/.env.qa']) {
    const url=new URL(path,import.meta.url);if(existsSync(url))loadEnvFile(url);
  }
  const { SUPABASE_URL:supabaseUrl,SUPABASE_ANON_KEY:anonKey,SUPABASE_PUBLICATION_KEY,
    QA_ACCESS_TOKEN:token,QA_EVIDENCIAS_ACTION_ID:actionId }=process.env;
  if(![supabaseUrl,anonKey,SUPABASE_PUBLICATION_KEY,token,actionId].every(Boolean)) {
    throw new Error('Configura SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLICATION_KEY, QA_ACCESS_TOKEN y QA_EVIDENCIAS_ACTION_ID en backend/.env o backend/.env.qa. Consulta docs/PROBAR-SCRUM-115.md.');
  }
  const servers=[];
  const cerrar=async()=>{for(const s of servers.reverse()){s.closeAllConnections();await new Promise(r=>s.close(r));}};
  async function escuchar(s){servers.push(s);await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${s.address().port}`;}
  try {
    const service=await escuchar(createInterventionsServer());
    const auth=await escuchar(createAuthServer());
    const gatewayUrl=await escuchar(createGatewayServer({allowedOrigins:[origin],targets:{interventions:new URL(service),auth:new URL(auth)}}));
    const headers={authorization:`Bearer ${token}`};
    const session=await fetch(`${gatewayUrl}/api/v1/auth/session`,{headers});
    if(!session.ok) {
      if([401,403].includes(session.status))throw new Error('La sesión de QA no es válida o no tiene permiso. Inicia sesión y actualiza QA_ACCESS_TOKEN.');
      throw new Error(`No se pudo consultar la sesión de QA (HTTP ${session.status}). Comprueba la conexión del Backend con Supabase.`);
    }
    const {data:{user}}=await session.json();
    const action=await fetch(`${gatewayUrl}/api/v1/actions/${encodeURIComponent(actionId)}`,{headers});
    if(!action.ok)throw new Error(`No se pudo consultar la Acción de QA (HTTP ${action.status}). Comprueba su ID, los permisos del usuario y la conexión con Supabase.`);
    const {data:{action:accion}}=await action.json();
    // Preflight de la migración pública, sin descargar ni publicar datos existentes.
    const preflight=await fetch(`${gatewayUrl}/api/v1/public/evidences/ffffffff-ffff-4fff-8fff-ffffffffffff/file`);
    if(preflight.status!==404)throw new Error('Falta aplicar la migración de publicación o configurar SUPABASE_PUBLICATION_KEY.');
    return {gatewayUrl,supabaseUrl,anonKey,token,user,actionId,planId:accion.id_plan,cerrar};
  } catch(error){await cerrar();throw error;}
}
