import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { logEvent } from '../../../../shared/observability/src/index.ts';
interface Options { supabaseUrl:string; auditKey?:string; fetchImpl?:typeof fetch }
export function createAuthAuditSynchronizer(options: Options) {
 const fetchImpl=options.fetchImpl??fetch;
 return async (userId?:string):Promise<void>=>{
  if(!options.auditKey)throw new ServiceError('AUDITORIA_NO_DISPONIBLE','Falta configurar el registro seguro de autenticación.',503);
  // Acotado, idempotente y sin transmitir sesiones, contraseñas o payload de Auth.
  for(let batch=0;batch<10;batch++) {
   let response:Response;
   try {response=await fetchImpl(`${options.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/sincronizar_eventos_autenticacion`,{
    method:'POST',headers:{apikey:options.auditKey,authorization:`Bearer ${options.auditKey}`,'content-type':'application/json'},
    body:JSON.stringify({p_limite:500,p_usuario:userId??null}),signal:AbortSignal.timeout(10000),redirect:'error',
   });} catch {throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible sincronizar la auditoría de autenticación.',503);}
   const count:unknown=await response.json().catch(()=>null);
   if(!response.ok||typeof count!=='number'||!Number.isInteger(count)||count<0||count>500)
    throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible sincronizar la auditoría de autenticación.',503);
   if(count<500)return;
  }
 };
}
export function createAuthEventRecorder(options: Options) {
 const fetchImpl=options.fetchImpl??fetch;
 return async(operation:string,userId?:string):Promise<void>=>{
  if(!options.auditKey)throw new ServiceError('AUDITORIA_NO_DISPONIBLE','Falta configurar el registro seguro de autenticación.',503);
  let response:Response;
  try {response=await fetchImpl(`${options.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/registrar_evento_autenticacion`,{
   method:'POST',headers:{apikey:options.auditKey,authorization:`Bearer ${options.auditKey}`,'content-type':'application/json'},
   body:JSON.stringify({p_exitoso:true,p_detalles:{operacion:operation,id_usuario:userId??null}}),
   signal:AbortSignal.timeout(10000),redirect:'error',
  });}catch{throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible registrar la operación de autenticación.',503);}
  if(!response.ok)throw new ServiceError('AUDITORIA_NO_DISPONIBLE','No fue posible registrar la operación de autenticación.',503);
 };
}

/** Recupera también eventos de Auth ocurridos fuera del backend. Un fallo no avanza cursor. */
export function startAuthAuditWorker(server:import('node:http').Server):void {
 const url=process.env.SUPABASE_URL??process.env.PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return;
 const synchronize=createAuthAuditSynchronizer({supabaseUrl:url,auditKey:key});
 let running=false;
 const run=async()=>{if(running)return;running=true;try{await synchronize();}catch{logEvent('error','audit.auth.sync.failed');}finally{running=false;}};
 const timer=setInterval(()=>{void run();},30000);timer.unref();
 server.once('listening',()=>{void run();});server.once('close',()=>clearInterval(timer));
}
