import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';
import { createInterventionsServer } from '../../../backend/services/interventions/src/server.ts';
import { createAuthServer } from '../../../backend/services/auth/src/server.ts';

export async function crearEntornoIndicadoresReal({origin='http://127.0.0.1:4336'}={}) {
  for(const path of ['../../../backend/.env','../../../backend/.env.qa']) {
    const url=new URL(path,import.meta.url);if(existsSync(url))loadEnvFile(url);
  }
  const {SUPABASE_URL:supabaseUrl,SUPABASE_ANON_KEY:anonKey,QA_ACCESS_TOKEN:token}=process.env;
  const referenceActionId=process.env.QA_INDICADORES_ACTION_ID || process.env.QA_EVIDENCIAS_ACTION_ID;
  if(![supabaseUrl,anonKey,token,referenceActionId].every(Boolean)) throw new Error('Completa QA_ACCESS_TOKEN y QA_INDICADORES_ACTION_ID en backend/.env.qa. Consulta docs/PROBAR-SCRUM-118.md.');
  let expiresAt;
  try {expiresAt=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString()).exp;} catch {}
  if(typeof expiresAt!=='number'||expiresAt*1000<=Date.now()) {
    throw new Error('QA_ACCESS_TOKEN venció o tiene un formato inválido. Copia una sesión nueva desde Network y actualiza backend/.env.qa.');
  }
  const servers=[];
  let gatewayUrl,qaAction;
  async function request(path,method='GET',data) {
    const r=await fetch(gatewayUrl+'/api/v1/'+path,{
      method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000),
    });
    const body=await r.json();
    if(!r.ok)throw new Error(`Preparación QA: ${body.error?.message??'Falló la consulta'} (HTTP ${r.status}).`);
    return body.data;
  }
  async function cerrar(){
    try {
      if(qaAction) {
        console.log('Limpiando Acción QA SCRUM-118:',qaAction.id_accion);
        const {indicadores}=await request(`actions/${qaAction.id_accion}/indicators`);
        for(const item of indicadores) {
          const r=await fetch(`${supabaseUrl}/rest/v1/rpc/archivar_indicador_seguro`,{
            method:'POST',headers:{authorization:`Bearer ${token}`,apikey:anonKey,'content-type':'application/json'},
            body:JSON.stringify({p_id:item.id_indicador,p_version:item.version}),signal:AbortSignal.timeout(15000),
          });
          if(!r.ok)throw new Error(`No se pudo archivar la asociación QA ${item.id_indicador} (HTTP ${r.status}).`);
        }
        const {action}=await request(`actions/${qaAction.id_accion}`);
        await request(`actions/${qaAction.id_accion}`,'DELETE',{version_esperada:action.version});
        console.log('Acción QA archivada:',qaAction.id_accion);
        qaAction=null;
      }
    } finally {
      for(const s of servers.reverse()){s.closeAllConnections();await new Promise(r=>s.close(r));}
    }
  }
  async function escuchar(s){servers.push(s);await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${s.address().port}`;}
  try {
    const service=await escuchar(createInterventionsServer());
    const auth=await escuchar(createAuthServer());
    gatewayUrl=await escuchar(createGatewayServer({allowedOrigins:[origin],targets:{interventions:new URL(service),auth:new URL(auth)}}));
    const {user}=await request('auth/session');
    const {action}=await request(`actions/${encodeURIComponent(referenceActionId)}`);
    const {catalogo}=await request('indicators/catalog');
    if(!catalogo.length)throw new Error('El catálogo está vacío. Completa la carga de indicadores en Supabase.');
    await request(`actions/${encodeURIComponent(referenceActionId)}/indicators`);
    const created=await request('actions','POST',{
      id_plan:action.id_plan,nombre:`QA SCRUM-118 ${randomUUID()}`,responsable_nombre:'Prueba automática SCRUM-118',
      fecha_inicio:action.fecha_inicio,fecha_termino:action.fecha_termino,estado:'no_iniciada',
      descripcion:'Acción sintética de prueba de Indicadores y Resultados. Se archiva al finalizar.',
    });
    qaAction=created.action;
    console.log('Acción QA creada:',qaAction.id_accion);
    return {gatewayUrl,supabaseUrl,anonKey,token,user,actionId:qaAction.id_accion,planId:action.id_plan,catalogId:catalogo[0].id_indicador,cerrar};
  } catch(error){await cerrar();throw error;}
}
