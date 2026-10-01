import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

const migracion = nombre => readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url),'utf8');
async function preparar(db) {
  await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina')");
  const {rows} = await db.query(`INSERT INTO public.organizaciones
    (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
    SELECT id_pais,'Organización ' || codigo_iso,'Responsable','123456789','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','centro_comunitario',10 FROM public.paises
    RETURNING id_organizacion,id_pais,nombre`);
  return {cl:rows.find(r=>r.nombre.endsWith('CL')),ar:rows.find(r=>r.nombre.endsWith('AR'))};
}
async function insertarPlan(tx, org, anual = true) {
  const {rows} = await tx.query(`INSERT INTO public.planes
    (id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino${anual?',periodo_anual':''})
    SELECT $1,id_programa,'Plan','Necesidad','Objetivo','Objetivos','Resultado','Responsable','2026-12-01','2027-03-01'${anual?',2026':''}
    FROM public.programas WHERE archived_at IS NULL LIMIT 1 RETURNING *`,[org]);
  return rows[0];
}
const porId = (db,id,operacion) => db.transaction(async tx => {
  await tx.exec('SET LOCAL ROLE authenticated');
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
  return operacion(tx);
});

test('SCRUM-84/87: persistencia real, integridad, versiones, permisos y auditoría', async t => {
  const db = await crearBaseProgramas();
  try {
    const {cl,ar} = await preparar(db);
    const plan = await comoUsuario(db,'ADMIN', async tx => {
      await tx.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-fge-ip-origen':'203.0.113.84'})]);
      return insertarPlan(tx,cl.id_organizacion);
    });
    const planAR = await comoUsuario(db,'ADMIN', tx => insertarPlan(tx,ar.id_organizacion));
    await t.test('Plan se consulta con Organización, Programa y año, sin Acciones obligatorias', async () => {
      const {rows} = await comoUsuario(db,'ADMIN',tx=>tx.query(`SELECT plan.*,org.nombre AS organizacion,prog.nombre AS programa FROM public.planes plan JOIN public.organizaciones org USING(id_organizacion) JOIN public.programas prog USING(id_programa) WHERE plan.id_plan=$1`,[plan.id_plan]));
      assert.equal(rows[0].periodo_anual,2026); assert.equal(rows[0].organizacion,cl.nombre); assert.ok(rows[0].programa);
      assert.equal(Number((await db.query('SELECT count(*) FROM public.acciones WHERE id_plan=$1',[plan.id_plan])).rows[0].count),0);
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>insertarPlan(tx,cl.id_organizacion,false)),{code:'23502'});
      for (const periodo of [0,10000]) await assert.rejects(db.query('UPDATE public.planes SET periodo_anual=$1 WHERE id_plan=$2',[periodo,plan.id_plan]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.planes SET fecha_termino='2026-01-01' WHERE id_plan=$1",[plan.id_plan]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.planes SET nombre=' ' WHERE id_plan=$1",[plan.id_plan]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.planes SET id_programa='ffffffff-ffff-4fff-8fff-ffffffffffff' WHERE id_plan=$1",[plan.id_plan]),{code:'23503'});
    });
    await t.test('Plan editado conserva creación y detecta versión antigua', async () => {
      const editar = () => comoUsuario(db,'ADMIN',tx=>tx.query('UPDATE public.planes SET periodo_anual=2027,nombre=$1 WHERE id_plan=$2 AND version=$3 RETURNING *',['Plan editado',plan.id_plan,1]));
      const updated = (await editar()).rows[0];
      assert.equal(updated.periodo_anual,2027); assert.equal(Number(updated.version),2);
      assert.equal(updated.created_by,plan.created_by); assert.deepEqual(updated.created_at,plan.created_at);
      assert.equal((await editar()).rows.length,0);
      assert.equal((await db.query('SELECT nombre FROM public.planes WHERE id_plan=$1',[plan.id_plan])).rows[0].nombre,'Plan editado');
    });
    const accion = (await comoUsuario(db,'ADMIN',tx=>tx.query(`INSERT INTO public.acciones(id_plan,nombre,descripcion,responsable_nombre,fecha_inicio,fecha_termino)
      VALUES($1,'Taller','Formación comunitaria','Responsable','2026-12-01','2027-02-01') RETURNING *`,[plan.id_plan]))).rows[0];
    await t.test('Acción persiste con descripción y Plan, sin Evidencias', async () => {
      const stored = (await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM public.acciones WHERE id_accion=$1',[accion.id_accion]))).rows[0];
      assert.equal(stored.id_plan,plan.id_plan); assert.equal(stored.descripcion,'Formación comunitaria'); assert.equal(stored.estado,'no_iniciada');
      for (const estado of ['atrasada','vencida','otro']) await assert.rejects(db.query('UPDATE public.acciones SET estado=$1 WHERE id_accion=$2',[estado,accion.id_accion]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.acciones SET estado='cancelada' WHERE id_accion=$1",[accion.id_accion]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.acciones SET fecha_termino='2020-01-01' WHERE id_accion=$1",[accion.id_accion]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.acciones SET descripcion=' ' WHERE id_accion=$1",[accion.id_accion]),{code:'23514'});
      await assert.rejects(db.query("UPDATE public.acciones SET id_plan='ffffffff-ffff-4fff-8fff-ffffffffffff' WHERE id_accion=$1",[accion.id_accion]),{code:'23514'});
    });
    await t.test('Acción editada conserva campos omitidos, admite NULL y protege versión', async () => {
      const editada = (await comoUsuario(db,'ADMIN',tx=>tx.query("UPDATE public.acciones SET responsable_nombre='Otra persona',estado='en_desarrollo' WHERE id_accion=$1 AND version=1 RETURNING *",[accion.id_accion]))).rows[0];
      assert.equal(Number(editada.version),2); assert.equal(editada.descripcion,accion.descripcion); assert.equal(editada.id_plan,plan.id_plan);
      assert.equal((await comoUsuario(db,'ADMIN',tx=>tx.query("UPDATE public.acciones SET nombre='Cambio antiguo' WHERE id_accion=$1 AND version=1 RETURNING *",[accion.id_accion]))).rows.length,0);
      await comoUsuario(db,'ADMIN',tx=>tx.query("UPDATE public.acciones SET estado='cancelada',observacion_motivo='Cambio de prioridad',descripcion=NULL WHERE id_accion=$1 AND version=2",[accion.id_accion]));
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('UPDATE public.acciones SET observacion_motivo=NULL WHERE id_accion=$1',[accion.id_accion])),{code:'23514'});
      const stored = (await db.query('SELECT * FROM public.acciones WHERE id_accion=$1',[accion.id_accion])).rows[0];
      assert.equal(stored.descripcion,null); assert.equal(stored.observacion_motivo,'Cambio de prioridad');
    });
    await t.test('RLS conserva gestión por país y controla también el nuevo vínculo', async () => {
      await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[cl.id_pais,usuarios.COORD]);
      assert.equal((await comoUsuario(db,'COORD',tx=>tx.query("UPDATE public.planes SET nombre='Coordinador CL' WHERE id_plan=$1 RETURNING *",[plan.id_plan]))).rows.length,1);
      assert.equal((await comoUsuario(db,'COORD',tx=>tx.query("UPDATE public.planes SET nombre='No autorizado' WHERE id_plan=$1 RETURNING *",[planAR.id_plan]))).rows.length,0);
      await assert.rejects(comoUsuario(db,'COORD',tx=>tx.query('UPDATE public.planes SET id_organizacion=$1 WHERE id_plan=$2',[ar.id_organizacion,plan.id_plan])),{code:'42501'});
      await assert.rejects(comoUsuario(db,'COORD',tx=>tx.query('UPDATE public.acciones SET id_plan=$1 WHERE id_accion=$2',[planAR.id_plan,accion.id_accion])),{code:'42501'});
      for (const [id,rol] of [['87000000-0000-4000-8000-000000000001','INVIT'],['87000000-0000-4000-8000-000000000002',null]]) {
        await db.query('INSERT INTO auth.users VALUES($1)',[id]); await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES($1,'QA observador')",[id]);
        if (rol) await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por) SELECT $1,id_rol,'global',$2 FROM public.roles WHERE codigo=$3",[id,usuarios.ADMIN,rol]);
        if (rol) await assert.rejects(porId(db,id,tx=>insertarPlan(tx,cl.id_organizacion)),{code:'42501'});
        else assert.equal(await porId(db,id,tx=>insertarPlan(tx,cl.id_organizacion)),undefined); // SELECT de Programas no revela filas.
        assert.equal((await porId(db,id,tx=>tx.query("UPDATE public.acciones SET nombre='No autorizado' WHERE id_accion=$1 RETURNING *",[accion.id_accion]))).rows.length,0);
      }
      await db.query('UPDATE public.asignaciones_roles SET revocado_at=now(),revocado_por=$1 WHERE id_usuario=$2',[usuarios.ADMIN,usuarios.COORD]);
      assert.equal((await comoUsuario(db,'COORD',tx=>tx.query("UPDATE public.planes SET nombre='Rol revocado' WHERE id_plan=$1 RETURNING *",[plan.id_plan]))).rows.length,0);
      await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');return tx.query('SELECT * FROM public.planes');}),{code:'42501'});
    });
    await t.test('auditoría privada conserva rol, país, IP, operación y antes/después', async () => {
      const hist = (await db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='planes' AND clave_registro->>'id_plan'=$1 AND tipo_accion='INSERT'",[plan.id_plan])).rows[0];
      assert.equal(hist.codigo_rol,'ADMIN'); assert.equal(hist.id_usuario,usuarios.ADMIN); assert.equal(hist.id_pais,cl.id_pais);
      assert.equal(hist.ip_origen,'203.0.113.84'); assert.equal(hist.fuente_ip,'aplicacion'); assert.ok(hist.id_asignacion); assert.ok(hist.fecha_hora);
      assert.equal(hist.despues.periodo_anual,2026); assert.equal(hist.antes,null);
      const updates = (await db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='acciones' AND clave_registro->>'id_accion'=$1 AND tipo_accion='UPDATE' ORDER BY id_historial_cambio",[accion.id_accion])).rows;
      assert.equal(updates[0].antes.estado,'no_iniciada'); assert.equal(updates[0].despues.estado,'en_desarrollo');
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT * FROM fge_private.historial_cambios')),{code:'42501'});
      await assert.rejects(db.query('DELETE FROM fge_private.historial_cambios'),{code:'42501'});
    });
  } finally { await db.close(); }
});

test('migraciones de actualización revierten datos ambiguos y aceptan correspondencias explícitas', async () => {
  const db = await crearBaseProgramas({planesAcciones:false});
  try {
    const {cl} = await preparar(db);
    const plan = await comoUsuario(db,'ADMIN',tx=>insertarPlan(tx,cl.id_organizacion,false));
    const accion = (await comoUsuario(db,'ADMIN',tx=>tx.query("INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino,estado) VALUES($1,'Acción antigua','Responsable','2026-12-01','2027-02-01','atrasada') RETURNING *",[plan.id_plan]))).rows[0];
    const anual = await migracion('20261002225129_fge_planes_periodo_anual.sql');
    await assert.rejects(db.exec(anual),{code:'23502'}); await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='planes' AND column_name='periodo_anual'")).rows[0].count,0);
    await db.query("SELECT set_config('fge.migracion_periodos_planes',$1,false)",[JSON.stringify({[plan.id_plan]:2027})]);
    await db.exec(anual);
    assert.equal((await db.query('SELECT periodo_anual FROM public.planes WHERE id_plan=$1',[plan.id_plan])).rows[0].periodo_anual,2027);
    const acciones = await migracion('20261002225133_fge_acciones_descripcion_estados.sql');
    await assert.rejects(db.exec(acciones),{code:'23514'}); await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT estado FROM public.acciones WHERE id_accion=$1',[accion.id_accion])).rows[0].estado,'atrasada');
    await db.query("SELECT set_config('fge.migracion_estados_acciones',$1,false)",[JSON.stringify({[accion.id_accion]:'en_desarrollo'})]);
    await db.exec(acciones);
    const stored = (await db.query('SELECT * FROM public.acciones WHERE id_accion=$1',[accion.id_accion])).rows[0];
    assert.equal(stored.estado,'en_desarrollo'); assert.equal(stored.nombre,accion.nombre); assert.equal(stored.id_plan,plan.id_plan);
    await assert.rejects(db.query("UPDATE public.acciones SET estado='atrasada' WHERE id_accion=$1",[accion.id_accion]),{code:'23514'});
  } finally { await db.close(); }
});
