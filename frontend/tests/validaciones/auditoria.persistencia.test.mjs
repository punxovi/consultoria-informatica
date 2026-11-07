import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

for(const legacy of [false,true]) test(`SCRUM-157: RF62 persistido (${legacy?'esquema existente':'esquema limpio'})`,async t=>{
 const db=await crearBaseProgramas();
 if(legacy) await db.exec(`ALTER TABLE fge_private.historial_cambios ADD COLUMN zona_horaria text, ADD COLUMN fecha_hora_local timestamp;
 CREATE FUNCTION fge_private.completar_contexto_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
 CREATE TRIGGER completar_contexto BEFORE INSERT ON fge_private.historial_cambios FOR EACH ROW EXECUTE FUNCTION fge_private.completar_contexto_auditoria();`);
 try {
  await db.exec(`CREATE FUNCTION storage.allow_any_operation(ops text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(replace(current_setting('storage.operation',true),'storage.','')=ANY(ops),false) $$;
   GRANT USAGE ON SCHEMA storage TO authenticated; GRANT SELECT ON storage.objects TO authenticated;
   ALTER TABLE storage.buckets ADD COLUMN name text, ADD COLUMN public boolean DEFAULT false;
   CREATE ROLE service_role; ALTER TABLE auth.users ADD COLUMN email text;
   CREATE TABLE auth.audit_log_entries(id uuid PRIMARY KEY,payload jsonb,ip_address text,created_at timestamptz DEFAULT clock_timestamp());`);
  for(const name of ['20260916221136_organizaciones_datos_parciales_20260916.sql',
   '20261002120000_fge_reforzar_rls_planes_acciones.sql','20261004185000_fge_rls_organizaciones.sql','20261004185001_fge_permisos_organizaciones.sql','20261007120000_fge_expediente_legal.sql',
   '20261019140000_fge_reportes_privacidad_auditoria.sql','20261027150000_fge_scrum149_paises.sql',
   '20261028020000_fge_auditoria_completar_funcional.sql','20261029_permisos_temporales_historial.sql',
   '20261029100000_fge_autorizacion_territorial_caducidad.sql','20261031120000_fge_administrar_coberturas.sql',
   '20261102150000_fge_coberturas_unicas_historial.sql','20261102170000_fge_coberturas_historial_esquema_existente.sql',
   '20261107010000_fge_scrum152_coberturas_integridad.sql','20261107020000_fge_scrum157_auditoria_rf62.sql','20261107021000_fge_scrum157_auditoria_copias_storage.sql'])
   await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
  const country=(await db.query("SELECT id_pais FROM public.paises WHERE codigo_iso='CL'")).rows[0].id_pais;
  const other=(await db.query("SELECT id_pais FROM public.paises WHERE codigo_iso='AR'")).rows[0].id_pais;
  const actor=usuarios.ADMIN;
  const asAdmin=fn=>db.transaction(async tx=>{await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);
   await tx.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-fge-ip-origen':'203.0.113.7','x-fge-request-id':'rf62-qa'})]);return fn(tx);});
  const history=()=>db.query('SELECT * FROM fge_private.historial_cambios ORDER BY id_historial_cambio');
  const count=async()=>Number((await db.query('SELECT count(*) AS n FROM fge_private.historial_cambios')).rows[0].n);
  await t.test('cuentas y roles conservan responsable, metadatos y registro afectado',async()=>{
   const user=randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);
   await asAdmin(async tx=>{
    await tx.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES($1,'Persona QA')",[user]);
    await tx.query("UPDATE public.perfiles SET nombre='Persona modificada' WHERE id_usuario=$1",[user]);
    await tx.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1',[user]);
    await tx.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'pais',$2,$3 FROM public.roles WHERE codigo='COORD'",[user,country,actor]);
    await tx.query('UPDATE public.asignaciones_roles SET revocado_at=clock_timestamp(),revocado_por=$2 WHERE id_usuario=$1',[user,actor]);
   });
   const events=(await history()).rows.filter(e=>e.request_id==='rf62-qa');
   for(const kind of ['cuenta_creada','cuenta_modificada','cuenta_desactivada','rol_otorgado','rol_revocado']) assert.ok(events.some(e=>e.tipo_evento===kind));
   assert.ok(events.every(e=>e.id_usuario===actor&&e.codigo_rol==='ADMIN'&&e.ip_origen==='203.0.113.7'));
   assert.ok(events.some(e=>e.clave_registro.id_usuario===user));
  });
  await t.test('gestión de países y ciclo de coberturas quedan instrumentados con hora local',async()=>{
   await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[other,usuarios.COORD]);
   await asAdmin(async tx=>{
    await tx.query("UPDATE public.paises SET nombre=nombre||' QA' WHERE id_pais=$1",[country]);
    const created=(await tx.query("SELECT public.administrar_coberturas('create',$1) AS j",[JSON.stringify({id_usuario_beneficiario:usuarios.COORD,id_pais:country,inicio_at:'2026-01-01',fin_at:'2090-01-10',motivo:'Cobertura RF62 QA'})])).rows[0].j;
    await tx.query("SELECT public.administrar_coberturas('extend',$1)",[JSON.stringify({id_permiso_temporal:created.id_permiso_temporal,version_esperada:1,nueva_fin_at:'2090-01-20'})]);
    await tx.query("SELECT public.administrar_coberturas('revoke',$1)",[JSON.stringify({id_permiso_temporal:created.id_permiso_temporal,version_esperada:2,motivo_revocacion:'Revocación RF62 QA'})]);
   });
   const events=(await history()).rows;
   for(const kind of ['pais_modificado','cobertura_otorgada','cobertura_extendida','cobertura_revocada']) assert.ok(events.some(e=>e.tipo_evento===kind));
   const event=events.find(e=>e.tipo_evento==='cobertura_extendida');
   assert.equal(event.id_pais,country); assert.equal(event.zona_horaria,'America/Santiago'); assert.notEqual(event.antes.fin_at,event.despues.fin_at);
   assert.equal((await db.query('SELECT fecha_hora_local=fecha_hora AT TIME ZONE zona_horaria AS ok FROM fge_private.historial_cambios WHERE id_historial_cambio=$1',[event.id_historial_cambio])).rows[0].ok,true);
  });
  await t.test('listados administrativos no producen eventos funcionales',async()=>{
   const before=await count();
   await comoUsuario(db,'ADMIN',tx=>tx.query("SELECT public.administrar_coberturas('list','{}')"));
   await comoUsuario(db,'ADMIN',tx=>tx.query("SELECT public.consultar_eventos_auditoria('{}')"));
   await comoUsuario(db,'ADMIN',tx=>tx.query("SELECT public.administrar_paises('list','{}')"));
   assert.equal(await count(),before);
  });
  await t.test('lectura legal autorizada se registra; inexistente y no autorizado se rechazan',async()=>{
   const org=(await db.query(`INSERT INTO public.organizaciones(id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve)
     VALUES($1,'Org RF62','QA','123','Comunidad','QA') RETURNING id_organizacion`,[country])).rows[0].id_organizacion;
   const legal=(await db.query("INSERT INTO public.informacion_legal(id_organizacion,estado_personalidad_juridica) VALUES($1,'no') RETURNING id_informacion_legal",[org])).rows[0].id_informacion_legal;
   await asAdmin(tx=>tx.query('SELECT public.registrar_acceso_documento($1)',[legal]));
   assert.ok((await history()).rows.some(e=>e.tipo_evento==='documento_consultado'&&e.clave_registro.id_informacion_legal===legal));
   await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.registrar_acceso_documento($1)',[randomUUID()])),{code:'42501'});
   await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT public.registrar_acceso_documento($1)',[legal]);}),{code:'42501'});
  });
  await t.test('Storage directo registra lectura privada y deja listados sin ruido',async()=>{
   const org=(await db.query('SELECT id_organizacion FROM public.organizaciones LIMIT 1')).rows[0].id_organizacion;
   const object=randomUUID();await db.query("INSERT INTO storage.objects(id,bucket_id,name) VALUES($1,'fge-expedientes-legales',$2)",[object,`expedientes/${org}/qa.pdf`]);
   const select=operation=>comoUsuario(db,'ADMIN',async tx=>{await tx.query("SELECT set_config('storage.operation',$1,true)",[operation]);return tx.query('SELECT id FROM storage.objects WHERE id=$1',[object]);});
   const before=await count();assert.equal((await select('storage.object.list')).rows.length,1);assert.equal(await count(),before);
   assert.equal((await select('object.get_authenticated')).rows.length,1);assert.equal(await count(),before+1);
   assert.equal((await select('object.copy')).rows.length,1);assert.equal(await count(),before+2);
   const access=(await history()).rows.find(e=>e.tipo_evento==='documento_acceso_storage');assert.equal(access.clave_registro.id_storage_object,object);
   await db.exec("ALTER TABLE fge_private.historial_cambios ADD CONSTRAINT qa_storage CHECK(tipo_evento<>'documento_acceso_storage') NOT VALID");
   await assert.rejects(select('object.get_authenticated'),{code:'23514'});
   await db.exec('ALTER TABLE fge_private.historial_cambios DROP CONSTRAINT qa_storage');
  });
  await t.test('exportación y autenticación nativa/fallida son identificables, sin guardar credenciales',async()=>{
   const ref=randomUUID(); await asAdmin(tx=>tx.query("SELECT public.registrar_exportacion_reporte('interno',$1)",[JSON.stringify({countryId:country,reportId:ref})]));
   await db.query("INSERT INTO auth.audit_log_entries(id,payload,ip_address) VALUES($1,$2,'198.51.100.4')",[randomUUID(),JSON.stringify({action:'login',actor_id:actor,secret:'no copiar'})]);
   await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.query("SELECT public.registrar_intento_autenticacion('failed-qa','198.51.100.5',400)");});
   await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.query('SELECT public.sincronizar_eventos_autenticacion()');});
   assert.equal((await db.query('SELECT public.sincronizar_eventos_autenticacion() AS n')).rows[0].n,0);
   const events=(await history()).rows; assert.ok(events.some(e=>e.tipo_evento==='reporte_exportado'&&e.clave_registro.filtros.reportId===ref));
   const login=events.find(e=>e.tipo_evento==='auth:login'); assert.equal(login.id_usuario,actor); assert.equal(login.codigo_rol,'ADMIN'); assert.equal(login.ip_origen,'198.51.100.4'); assert.equal(login.fuente_ip,'proveedor_auth');
   assert.equal(JSON.stringify(login).includes('no copiar'),false);
   assert.ok(events.some(e=>e.tipo_evento==='auth:login_fallido'&&e.codigo_rol==='ANON'&&e.id_usuario===null));
   await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query("SELECT public.registrar_evento_autenticacion(true,'{}')")),{code:'42501'});
   await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query("SELECT public.registrar_intento_autenticacion('fake','198.51.100.1',400)")),{code:'42501'});
  });
  await t.test('rol nativo se reconstruye al instante del evento y el backend solo atestigua con credencial privada',async()=>{
   const eventId=randomUUID();
   await db.query("INSERT INTO auth.audit_log_entries(id,payload,ip_address) VALUES($1,$2,'198.51.100.8')",[eventId,JSON.stringify({action:'login',actor_id:usuarios.COORD})]);
   await db.query("UPDATE public.asignaciones_roles SET revocado_at=clock_timestamp()+interval '1 second',revocado_por=$2 WHERE id_usuario=$1 AND revocado_at IS NULL",[usuarios.COORD,actor]);
   await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'pais',$2,$3 FROM public.roles WHERE codigo='INVIT'",[usuarios.COORD,other,actor]);
   await db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');await tx.query('SELECT public.sincronizar_eventos_autenticacion()');
    await tx.query('SELECT public.registrar_evento_autenticacion(true,$1)',[JSON.stringify({id_usuario:actor,operacion:'login_backend'})]);});
   const events=(await history()).rows;
   assert.equal(events.find(e=>e.clave_registro.id_evento_auth===eventId).codigo_rol,'COORD');
   assert.ok(events.some(e=>e.tipo_evento==='auth:login_backend'&&e.id_usuario===actor));
  });
  await t.test('ningún rol de aplicación ni el propietario con triggers activos altera o borra el historial',async()=>{
   for(const role of ['authenticated','anon','service_role']) for(const sql of ["UPDATE fge_private.historial_cambios SET actor_sql='fake'",'DELETE FROM fge_private.historial_cambios','TRUNCATE fge_private.historial_cambios'])
    await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.exec(sql);}),{code:'42501'});
   for(const sql of ["UPDATE fge_private.historial_cambios SET actor_sql='fake'",'DELETE FROM fge_private.historial_cambios','TRUNCATE fge_private.historial_cambios']) await assert.rejects(db.exec(sql),{code:'42501'});
   await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL session_replication_role=replica');await tx.exec('DELETE FROM fge_private.historial_cambios');}),{code:'42501'});
  });
  await t.test('script remoto reproduce metadatos, Auth e inmutabilidad y revierte sus datos',async()=>{
   await db.exec(await readFile(new URL('../../../supabase/checks/auditoria-scrum157.sql',import.meta.url),'utf8'));
   assert.equal((await db.query("SELECT count(*)::int AS n FROM fge_private.historial_cambios WHERE request_id='QA-SCRUM157'")).rows[0].n,0);
  });
 } finally {await db.close();}
});
