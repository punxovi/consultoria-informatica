import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

test('Evidencias: migración, CRUD, consentimiento, publicación, RLS y catálogo Storage', async t => {
  const db = await crearBaseProgramas();
  try {
    await db.exec(`ALTER TABLE storage.buckets ADD COLUMN name text, ADD COLUMN public boolean DEFAULT false;
      ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
      ALTER TABLE storage.objects ALTER COLUMN id SET DEFAULT gen_random_uuid();
      CREATE UNIQUE INDEX objetos_ruta_uq ON storage.objects(bucket_id,name);
      GRANT USAGE ON SCHEMA storage TO authenticated, anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;`);
    for (const name of ['20261002120000_fge_reforzar_rls_planes_acciones.sql','20261013120000_fge_evidencias.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url),'utf8'));
    }
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina')");
    const orgs = (await db.query(`INSERT INTO public.organizaciones
      (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      SELECT id_pais,'Org '||codigo_iso,'QA','123456789','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','QA','centro_comunitario',10
      FROM public.paises RETURNING id_organizacion,id_pais,nombre`)).rows;
    const cl = orgs.find(o => o.nombre === 'Org CL');
    const ar = orgs.find(o => o.nombre === 'Org AR');
    async function accion(org) {
      const plan = (await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.planes
        (id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
        SELECT $1,id_programa,'Plan','Necesidad','Objetivo','Objetivos','Resultado','QA','2026-01-01','2026-12-31',2026
        FROM public.programas LIMIT 1 RETURNING id_plan`,[org.id_organizacion]))).rows[0];
      return (await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.acciones
        (id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
        VALUES($1,'Acción QA','QA','2026-01-01','2026-12-31') RETURNING id_accion`,[plan.id_plan]))).rows[0].id_accion;
    }
    const action = await accion(cl);
    const foreignAction = await accion(ar);
    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[cl.id_pais,usuarios.COORD]);
    const insert = (id=action, rol='ADMIN') => comoUsuario(db,rol,tx=>tx.query(`INSERT INTO public.evidencias
      (id_accion,origen,descripcion,nombre_original,mime_type,tamano_bytes,incorporado_por,incorporado_at)
      VALUES($1,'Visita a terreno','Fotografía de actividad','actividad.png','image/png',12,$2,'1990-01-01') RETURNING *`,[id,usuarios.COORD]));
    let evidence;
    const update = (set, params=[], rol='ADMIN') => comoUsuario(db,rol,tx=>tx.query(`UPDATE public.evidencias SET ${set} WHERE id_evidencia=$1 RETURNING *`,[evidence.id_evidencia,...params]));
    const get = () => comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM public.evidencias WHERE id_evidencia=$1',[evidence.id_evidencia]));
    const upload = (bucket,path,metadata={size:12,mimetype:'image/png'},rol='ADMIN') => comoUsuario(db,rol,tx=>tx.query(
      'INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3) RETURNING id',[bucket,path,metadata]));

    await t.test('migra y crea un bucket privado con límites propios', async () => {
      const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='fge-evidencias'")).rows[0];
      assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),52428800);
      assert.ok(bucket.allowed_mime_types.includes('application/pdf'));
    });
    await t.test('registra metadatos y sella actor, fecha y versión sin aceptar suplantación', async () => {
      evidence = (await insert()).rows[0];
      assert.equal(evidence.incorporado_por,usuarios.ADMIN);
      assert.equal(evidence.created_by,usuarios.ADMIN);
      assert.ok(new Date(evidence.incorporado_at).getUTCFullYear() > 1990);
      assert.equal(evidence.ruta_objeto,action+'/'+evidence.id_evidencia);
      assert.equal(evidence.publicado,false); assert.equal(evidence.consentimiento_declarado,null);
      assert.equal(Number(evidence.version),1);
    });
    await t.test('consulta por ID y por Acción/Plan/Organización', async () => {
      assert.equal((await get()).rows.length,1);
      const rows = (await comoUsuario(db,'ADMIN',tx=>tx.query(`SELECT e.id_evidencia FROM public.evidencias e
        JOIN public.acciones a USING(id_accion) JOIN public.planes p USING(id_plan)
        WHERE p.id_organizacion=$1`,[cl.id_organizacion]))).rows;
      assert.equal(rows[0].id_evidencia,evidence.id_evidencia);
    });
    await t.test('rechaza metadatos inválidos y protege relación y referencia inmutables', async () => {
      for (const set of ["descripcion=' '","origen=' '","estado_carga='inventado'","estado_publicacion='inventado'",
        "tamano_bytes=0","mime_type='text/html'","id_accion='ffffffff-ffff-4fff-8fff-ffffffffffff'",
        "nombre_original='otro.png'"]) await assert.rejects(update(set),{code:'23514'});
      await assert.rejects(insert('ffffffff-ffff-4fff-8fff-ffffffffffff'),{code:'42501'});
      await assert.rejects(db.query('DELETE FROM public.acciones WHERE id_accion=$1',[action]),error=>
        ['23503','23001'].includes(error.code) && error.message.includes('evidencias_id_accion_fkey'));
    });
    await t.test('permite gestionar su país y bloquea otro país y usuarios sin rol', async () => {
      await insert(action,'COORD');
      await assert.rejects(insert(foreignAction,'COORD'),{code:'42501'});
      const foreign = (await insert(foreignAction)).rows[0];
      const rows = (await comoUsuario(db,'COORD',tx=>tx.query("UPDATE public.evidencias SET descripcion='No autorizado' WHERE id_evidencia=$1 RETURNING *",[foreign.id_evidencia]))).rows;
      assert.equal(rows.length,0);
      await assert.rejects(upload('fge-evidencias',foreign.ruta_objeto,undefined,'COORD'),{code:'42501'});
      await db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",['99999999-9999-4999-8999-999999999999']);
        assert.equal((await tx.query('SELECT * FROM public.evidencias')).rows.length,0);
      });
      await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM public.evidencias');}),{code:'42501'});
    });
    await t.test('solo permite cargar un objeto reservado y no confirma objetos ausentes o ajenos', async () => {
      await assert.rejects(update("estado_carga='disponible'"),{code:'23514'});
      await assert.rejects(upload('fge-evidencias','ruta-no-reservada'),{code:'42501'});
      await assert.rejects(upload('otro-bucket',evidence.ruta_objeto),{code:'42501'});
      await upload('fge-evidencias',evidence.ruta_objeto,{size:99,mimetype:'image/png'});
      await assert.rejects(update("estado_carga='disponible'"),{code:'23514'});
      await db.query("UPDATE storage.objects SET metadata=$1 WHERE name=$2",[{size:12,mimetype:'image/png'},evidence.ruta_objeto]);
      assert.equal((await update("estado_carga='disponible'")).rows[0].estado_carga,'disponible');
    });
    await t.test('consulta objeto disponible y bloquea reemplazo, borrado y nueva carga en la misma ruta', async () => {
      const objects = await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM storage.objects WHERE name=$1',[evidence.ruta_objeto]));
      assert.equal(objects.rows.length,1);
      await assert.rejects(upload('fge-evidencias',evidence.ruta_objeto),{code:'42501'});
      for (const sql of ['DELETE FROM storage.objects WHERE name=$1 RETURNING *',"UPDATE storage.objects SET metadata='{}' WHERE name=$1 RETURNING *"]) {
        assert.equal((await comoUsuario(db,'ADMIN',tx=>tx.query(sql,[evidence.ruta_objeto]))).rows.length,0);
      }
      await assert.rejects(update("estado_carga='reservado'"),{code:'23514'});
    });
    await t.test('exige declaración completa y consentimiento antes de publicar', async () => {
      await assert.rejects(update("estado_publicacion='publicada'"),{code:'23514'});
      await assert.rejects(update('consentimiento_declarado=true'),{code:'23514'});
      await assert.rejects(update("estado_publicacion='retirada'"),{code:'23514'});
      const consent = (await update("consentimiento_declarado=true,declaracion_consentimiento='Autorización registrada',consentimiento_por=$2,consentimiento_at='1990-01-01'",[usuarios.ADMIN],'COORD')).rows[0];
      assert.equal(consent.consentimiento_por,usuarios.COORD);
      assert.ok(new Date(consent.consentimiento_at).getUTCFullYear()>1990);
      const unchanged = (await update('consentimiento_por=$2,consentimiento_at=now()',[usuarios.ADMIN])).rows[0];
      assert.equal(unchanged.consentimiento_por,usuarios.COORD);
      assert.deepEqual(unchanged.consentimiento_at,consent.consentimiento_at);
      const published = (await update("estado_publicacion='publicada'")).rows[0];
      assert.equal(published.publicado,true); assert.equal(published.publicacion_actualizada_por,usuarios.ADMIN);
    });
    await t.test('retira publicación para revocar consentimiento y conserva el historial', async () => {
      await assert.rejects(update('consentimiento_declarado=false'),{code:'23514'});
      await assert.rejects(update('consentimiento_declarado=NULL,declaracion_consentimiento=NULL'),{code:'23514'});
      await assert.rejects(update("estado_publicacion='no_publicada'"),{code:'23514'});
      const published = (await get()).rows[0];
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.archivar_evidencia_segura($1,$2)',[evidence.id_evidencia,published.version])),{code:'23514'});
      const withdrawn = (await update("estado_publicacion='retirada',consentimiento_declarado=false,declaracion_consentimiento='Autorización revocada'")).rows[0];
      assert.equal(withdrawn.publicado,false); assert.equal(withdrawn.consentimiento_declarado,false);
      const history = (await db.query("SELECT antes,despues FROM fge_private.historial_cambios WHERE tabla_afectada='evidencias' AND clave_registro->>'id_evidencia'=$1 AND tipo_accion='UPDATE' ORDER BY id_historial_cambio DESC",[evidence.id_evidencia])).rows[0];
      assert.equal(history.antes.estado_publicacion,'publicada'); assert.equal(history.despues.estado_publicacion,'retirada');
      assert.equal(history.antes.consentimiento_declarado,true);
    });
    await t.test('sella edición, preserva creación y permite control de versión optimista', async () => {
      const before = (await get()).rows[0];
      const changed = (await update("descripcion='Descripción revisada',created_by=$2,version=999",[usuarios.COORD])).rows[0];
      assert.equal(changed.created_by,usuarios.ADMIN); assert.deepEqual(changed.created_at,evidence.created_at);
      assert.equal(Number(changed.version),Number(before.version)+1);
      const stale = await comoUsuario(db,'ADMIN',tx=>tx.query("UPDATE public.evidencias SET descripcion='Cambio antiguo' WHERE id_evidencia=$1 AND version=$2 RETURNING *",[evidence.id_evidencia,before.version]));
      assert.equal(stale.rows.length,0);
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM fge_private.historial_cambios')),{code:'42501'});
    });
    await t.test('archiva sin borrado físico y oculta el objeto', async () => {
      const current = (await get()).rows[0];
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.archivar_evidencia_segura($1,$2)',[evidence.id_evidencia,0])),{code:'40001'});
      await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.archivar_evidencia_segura($1,$2)',[evidence.id_evidencia,current.version]));
      assert.equal((await get()).rows.length,0);
      assert.equal((await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM storage.objects WHERE name=$1',[evidence.ruta_objeto]))).rows.length,0);
      assert.equal((await db.query('SELECT * FROM public.evidencias WHERE id_evidencia=$1',[evidence.id_evidencia])).rows.length,1);
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('DELETE FROM public.evidencias WHERE id_evidencia=$1',[evidence.id_evidencia])),{code:'42501'});
    });
  } finally { await db.close(); }
});
