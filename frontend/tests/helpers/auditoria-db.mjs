import { readFile } from 'node:fs/promises';
/** Soporte mínimo Auth/Storage del adaptador; el registro se ejecuta con SQL real. */
export async function instalarAuditoriaRF62(db) {
 if((await db.query("SELECT to_regprocedure('public.registrar_acceso_archivo(text,uuid)') IS NOT NULL AS instalado")).rows[0].instalado)return;
 await db.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
  ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  CREATE TABLE IF NOT EXISTS auth.audit_log_entries(id uuid PRIMARY KEY,payload jsonb,ip_address text,created_at timestamptz DEFAULT clock_timestamp());
  ALTER TABLE public.paises ADD COLUMN IF NOT EXISTS zona_horaria text;
  CREATE OR REPLACE FUNCTION storage.allow_any_operation(ops text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT coalesce(replace(current_setting('storage.operation',true),'storage.','')=ANY(ops),false) $$;`);
 for(const name of ['20261019140000_fge_reportes_privacidad_auditoria.sql','20261028020000_fge_auditoria_completar_funcional.sql','20261107020000_fge_scrum157_auditoria_rf62.sql','20261107021000_fge_scrum157_auditoria_copias_storage.sql'])
  await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
}
export function esRpcAuditoria(path) {
 return ['/rest/v1/rpc/registrar_acceso_documento','/rest/v1/rpc/registrar_acceso_archivo','/rest/v1/rpc/registrar_exportacion_reporte'].includes(path);
}
export async function ejecutarRpcAuditoria(db,user,path,input,headers={}) {
 return db.transaction(async tx=>{
  await tx.exec('SET LOCAL ROLE authenticated');
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  await tx.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-fge-ip-origen':headers['x-fge-ip-origen'],'x-fge-request-id':headers['x-fge-request-id']})]);
  if(path.endsWith('registrar_acceso_documento'))await tx.query('SELECT public.registrar_acceso_documento($1)',[input.p_id_documento]);
  else if(path.endsWith('registrar_acceso_archivo'))await tx.query('SELECT public.registrar_acceso_archivo($1,$2)',[input.p_tipo,input.p_id]);
  else await tx.query('SELECT public.registrar_exportacion_reporte($1,$2)',[input.p_destino,JSON.stringify(input.p_filtros)]);
  return null;
 });
}
