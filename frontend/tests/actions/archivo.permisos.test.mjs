import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

test('archivo con permisos reales: ADMIN, COORD por país, versiones, cascada y auditoría', async () => {
  const db = await crearBaseProgramas();
  try {
    for (const nombre of ['20260929090000_fge_acciones_actions_rls.sql', '20261002010000_fge_archivar_planes_acciones.sql']) {
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${nombre}`, import.meta.url), 'utf8'));
    }
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina')");
    const organizaciones = await db.query(`INSERT INTO public.organizaciones
      (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      SELECT id_pais,'QA ' || codigo_iso,'Responsable','123456789','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','centro_comunitario',10
      FROM public.paises WHERE codigo_iso IN ('CL','AR') RETURNING id_organizacion, nombre`);
    const planes = [];
    for (const org of organizaciones.rows) {
      const plan = await comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.planes
        (id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino)
        SELECT $1,id_programa,$2,'Necesidad','Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
        FROM public.programas WHERE archived_at IS NULL LIMIT 1 RETURNING *`, [org.id_organizacion, org.nombre]));
      const accion = await comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.acciones
        (id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino) VALUES ($1,'Acción','Responsable','2026-01-01','2026-12-01') RETURNING *`, [plan.rows[0].id_plan]));
      planes.push({ ...plan.rows[0], accion: accion.rows[0] });
    }
    const cl = planes.find(plan => plan.nombre === 'QA CL');
    const ar = planes.find(plan => plan.nombre === 'QA AR');
    assert.ok(cl && ar);
    // ADMIN también puede editar Acciones con la migración de permisos aplicada.
    const editada = await comoUsuario(db, 'ADMIN', tx => tx.query("UPDATE public.acciones SET nombre='Acción editada' WHERE id_accion=$1 RETURNING *", [ar.accion.id_accion]));
    assert.equal(editada.rows[0].nombre, 'Acción editada');
    await db.query(`UPDATE public.asignaciones_roles SET alcance='pais',id_pais=(SELECT id_pais FROM public.paises WHERE codigo_iso='CL') WHERE id_usuario=$1`, [usuarios.COORD]);
    await assert.rejects(comoUsuario(db, 'COORD', tx => tx.query('SELECT public.archivar_accion_seguro($1,$2)', [ar.accion.id_accion, editada.rows[0].version])), { code: '42501' });
    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query('SELECT public.archivar_plan_seguro($1,999)', [ar.id_plan])), { code: '40001' });
    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query('SELECT public.archivar_accion_seguro($1,NULL)', [cl.accion.id_accion])), { code: '40001' });
    await comoUsuario(db, 'COORD', tx => tx.query('SELECT public.archivar_accion_seguro($1,$2)', [cl.accion.id_accion, cl.accion.version]));
    assert.ok((await db.query('SELECT archived_at FROM public.acciones WHERE id_accion=$1', [cl.accion.id_accion])).rows[0].archived_at);
    // Si falla una acción hija se revierte toda la eliminación del plan.
    await db.exec(`CREATE FUNCTION public.qa_impedir_archivo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo simulado'; END $$;
      CREATE TRIGGER qa_impedir_archivo BEFORE UPDATE ON public.acciones FOR EACH ROW EXECUTE FUNCTION public.qa_impedir_archivo();`);
    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query('SELECT public.archivar_plan_seguro($1,$2)', [ar.id_plan, ar.version])));
    assert.equal((await db.query('SELECT archived_at FROM public.planes WHERE id_plan=$1', [ar.id_plan])).rows[0].archived_at, null);
    await db.exec('DROP TRIGGER qa_impedir_archivo ON public.acciones');
    await comoUsuario(db, 'ADMIN', tx => tx.query('SELECT public.archivar_plan_seguro($1,$2)', [ar.id_plan, ar.version]));
    assert.ok((await db.query('SELECT archived_at FROM public.planes WHERE id_plan=$1', [ar.id_plan])).rows[0].archived_at);
    assert.ok((await db.query('SELECT archived_at FROM public.acciones WHERE id_accion=$1', [ar.accion.id_accion])).rows[0].archived_at);
    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino) VALUES ($1,'Nueva','Responsable','2026-01-01','2026-02-01')`, [ar.id_plan])), { code: '23514' });
    const auditoria = await db.query(`SELECT count(*) FROM fge_private.historial_cambios WHERE tabla_afectada IN ('planes','acciones') AND despues->>'archived_at' IS NOT NULL AND id_usuario IS NOT NULL`);
    assert.ok(Number(auditoria.rows[0].count) >= 3);
    await assert.rejects(db.transaction(async tx => { await tx.exec('SET LOCAL ROLE anon'); await tx.query('SELECT public.archivar_plan_seguro($1,1)', [cl.id_plan]); }), { code: '42501' });
    await db.query(`UPDATE public.asignaciones_roles SET id_rol=(SELECT id_rol FROM public.roles WHERE codigo='INVIT'), alcance='global',id_pais=NULL WHERE id_usuario=$1`, [usuarios.COORD]);
    await assert.rejects(comoUsuario(db, 'COORD', tx => tx.query('SELECT public.archivar_plan_seguro($1,$2)', [cl.id_plan, cl.version])), { code: '42501' });
  } finally { await db.close(); }
});
