import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

test('Sprint 6 RLS: Indicadores y Resultados (catálogo estándar, asociaciones, alcance territorial y anon)', async t => {
  const db = await crearBaseProgramas();
  try {
    for (const name of [
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261015120000_fge_tabla_indicadores.sql',
      '20261015120100_fge_tabla_resultados.sql',
      '20261015130000_fge_sprint6_rls.sql'
    ]) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }

    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina') ON CONFLICT DO NOTHING");
    const orgs = (await db.query(`INSERT INTO public.organizaciones
      (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      SELECT id_pais,'Org '||codigo_iso,'QA','123456789','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','QA','centro_comunitario',10
      FROM public.paises RETURNING id_organizacion,id_pais,nombre`)).rows;
    const cl = orgs.find(o => o.nombre === 'Org CL');
    const ar = orgs.find(o => o.nombre === 'Org AR');

    async function crearAccion(org) {
      const plan = (await comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.planes
        (id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
        SELECT $1,id_programa,'Plan QA','Necesidad','Objetivo','Objetivos','Resultado','QA','2026-01-01','2026-12-31',2026
        FROM public.programas LIMIT 1 RETURNING id_plan`, [org.id_organizacion]))).rows[0];
      return (await comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.acciones
        (id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
        VALUES($1,'Acción QA','QA','2026-01-01','2026-12-31') RETURNING id_accion`, [plan.id_plan]))).rows[0].id_accion;
    }

    const accionCL = await crearAccion(cl);
    const accionAR = await crearAccion(ar);

    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2", [cl.id_pais, usuarios.COORD]);

    let idIndicadorEstandar;
    let idIndicadorCL;
    let idIndicadorAR;

    await t.test('Catálogo estándar de indicadores (id_accion IS NULL): ADMIN gestiona, COORD solo lee', async () => {
      const resAdmin = await comoUsuario(db, 'ADMIN', tx => tx.query(`
        INSERT INTO public.indicadores (nombre, descripcion, unidad_medida, meta)
        VALUES ('Tasa de asistencia estándar', 'Indicador institucional', 'porcentaje', 85)
        RETURNING id_indicador, version, created_by
      `));
      assert.equal(resAdmin.rows.length, 1);
      idIndicadorEstandar = resAdmin.rows[0].id_indicador;
      assert.equal(resAdmin.rows[0].created_by, usuarios.ADMIN);

      const resReadCoord = await comoUsuario(db, 'COORD', tx => tx.query(`
        SELECT * FROM public.indicadores WHERE id_indicador = $1
      `, [idIndicadorEstandar]));
      assert.equal(resReadCoord.rows.length, 1);
      assert.equal(resReadCoord.rows[0].nombre, 'Tasa de asistencia estándar');

      await assert.rejects(
        comoUsuario(db, 'COORD', tx => tx.query(`
          INSERT INTO public.indicadores (nombre, unidad_medida)
          VALUES ('Indicador no autorizado', 'unidad')
        `)),
        error => error.code === '42501' || error.message.includes('row-level security')
      );

      const resUpdateCoord = await comoUsuario(db, 'COORD', tx => tx.query(`
        UPDATE public.indicadores SET nombre = 'Modificado por COORD' WHERE id_indicador = $1 RETURNING *
      `, [idIndicadorEstandar]));
      assert.equal(resUpdateCoord.rows.length, 0);

      const resUpdateAdmin = await comoUsuario(db, 'ADMIN', tx => tx.query(`
        UPDATE public.indicadores SET meta = 90 WHERE id_indicador = $1 RETURNING *
      `, [idIndicadorEstandar]));
      assert.equal(resUpdateAdmin.rows.length, 1);
      assert.equal(Number(resUpdateAdmin.rows[0].meta), 90);
    });

    await t.test('Indicadores asociados a acciones: respeta alcance territorial por país', async () => {
      const resCL = await comoUsuario(db, 'COORD', tx => tx.query(`
        INSERT INTO public.indicadores (id_accion, nombre, unidad_medida, meta)
        VALUES ($1, 'Asistencia local CL', 'personas', 50)
        RETURNING id_indicador, created_by
      `, [accionCL]));
      assert.equal(resCL.rows.length, 1);
      idIndicadorCL = resCL.rows[0].id_indicador;
      assert.equal(resCL.rows[0].created_by, usuarios.COORD);

      await assert.rejects(
        comoUsuario(db, 'COORD', tx => tx.query(`
          INSERT INTO public.indicadores (id_accion, nombre, unidad_medida, meta)
          VALUES ($1, 'Asistencia en AR', 'personas', 30)
        `, [accionAR])),
        error => error.code === '42501' || error.message.includes('row-level security')
      );

      const resAR = await comoUsuario(db, 'ADMIN', tx => tx.query(`
        INSERT INTO public.indicadores (id_accion, nombre, unidad_medida, meta)
        VALUES ($1, 'Asistencia en AR por ADMIN', 'personas', 30)
        RETURNING id_indicador
      `, [accionAR]));
      idIndicadorAR = resAR.rows[0].id_indicador;

      const updateAR = await comoUsuario(db, 'COORD', tx => tx.query(`
        UPDATE public.indicadores SET meta = 999 WHERE id_indicador = $1 RETURNING *
      `, [idIndicadorAR]));
      assert.equal(updateAR.rows.length, 0);

      const updateCL = await comoUsuario(db, 'COORD', tx => tx.query(`
        UPDATE public.indicadores SET meta = 55 WHERE id_indicador = $1 RETURNING *
      `, [idIndicadorCL]));
      assert.equal(updateCL.rows.length, 1);
      assert.equal(Number(updateCL.rows[0].meta), 55);
    });

    await t.test('Resultados de medición: respeta alcance territorial y permisos del indicador padre', async () => {
      const resMedicionCL = await comoUsuario(db, 'COORD', tx => tx.query(`
        INSERT INTO public.resultados (id_indicador, valor_medido, fecha_medicion, observaciones)
        VALUES ($1, 48, '2026-06-15', 'Medición semestral CL')
        RETURNING id_resultado, valor_medido
      `, [idIndicadorCL]));
      assert.equal(resMedicionCL.rows.length, 1);
      assert.equal(Number(resMedicionCL.rows[0].valor_medido), 48);

      await assert.rejects(
        comoUsuario(db, 'COORD', tx => tx.query(`
          INSERT INTO public.resultados (id_indicador, valor_medido, fecha_medicion)
          VALUES ($1, 25, '2026-06-15')
        `, [idIndicadorAR])),
        error => error.code === '42501' || error.message.includes('row-level security')
      );

      const lecturasCL = await comoUsuario(db, 'COORD', tx => tx.query(`
        SELECT * FROM public.resultados WHERE id_indicador = $1
      `, [idIndicadorCL]));
      assert.equal(lecturasCL.rows.length, 1);
    });

    await t.test('Anon y usuarios no autenticados: acceso totalmente denegado', async () => {
      await assert.rejects(
        db.transaction(async tx => {
          await tx.exec('SET LOCAL ROLE anon');
          await tx.query('SELECT * FROM public.indicadores');
        }),
        { code: '42501' }
      );

      await assert.rejects(
        db.transaction(async tx => {
          await tx.exec('SET LOCAL ROLE anon');
          await tx.query('SELECT * FROM public.resultados');
        }),
        { code: '42501' }
      );
    });

    await t.test('Archivado seguro: control de versión y ocultamiento por RLS', async () => {
      const ind = (await comoUsuario(db, 'COORD', tx => tx.query(
        'SELECT version FROM public.indicadores WHERE id_indicador = $1', [idIndicadorCL]
      ))).rows[0];

      await comoUsuario(db, 'COORD', tx => tx.query(
        'SELECT public.archivar_indicador_seguro($1, $2)', [idIndicadorCL, ind.version]
      ));

      const despues = await comoUsuario(db, 'COORD', tx => tx.query(
        'SELECT * FROM public.indicadores WHERE id_indicador = $1', [idIndicadorCL]
      ));
      assert.equal(despues.rows.length, 0);

      const resDespues = await comoUsuario(db, 'COORD', tx => tx.query(
        'SELECT * FROM public.resultados WHERE id_indicador = $1', [idIndicadorCL]
      ));
      assert.equal(resDespues.rows.length, 0);
    });

  } finally {
    await db.close();
  }
});
