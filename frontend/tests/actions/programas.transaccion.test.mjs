import assert from 'node:assert/strict';
import { before, after, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, guardar, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

let db;
before(async () => { db = await crearBaseProgramas(); });
after(async () => { await db?.close(); });
const entrada = () => ({
  nombre: 'Programa transaccional', descripcion: 'Descripción', objetivo_general: 'Objetivo general', objetivos_especificos: 'Objetivos específicos',
  lineas_accion: [
    { linea_accion: 'Formación', resultado_esperado: 'Equipo capacitado' },
    { linea_accion: 'Acompañamiento', resultado_esperado: 'Organización fortalecida' },
  ],
});

it('conserva el orden de las líneas al crear, modificar, agregar y retirar', async () => {
  const lineas = Array.from({ length: 10 }, (_, i) => ({
    linea_accion: `Línea ${i + 1}`, resultado_esperado: `Resultado ${i + 1}`,
  }));
  const creado = await guardar(db, { ...entrada(), lineas_accion: lineas });
  const pares = filas => filas.map(({ linea_accion, resultado_esperado }) => ({ linea_accion, resultado_esperado }));
  assert.deepEqual(pares(creado.lineas_accion), lineas);
  const reordenadas = [
    lineas[7], { ...lineas[0], resultado_esperado: 'Resultado actualizado' },
    { linea_accion: 'Línea agregada', resultado_esperado: 'Resultado nuevo' }, lineas[3],
  ];
  const actualizado = await guardar(db, { lineas_accion: reordenadas }, creado.id_programa, creado.version);
  assert.deepEqual(pares(actualizado.lineas_accion), reordenadas);
  const consulta = await comoUsuario(db, 'COORD', tx => tx.query(
    'SELECT * FROM public.programa_lineas_accion WHERE id_programa = $1 AND archived_at IS NULL ORDER BY orden, created_at, id_linea_accion',
    [creado.id_programa],
  ));
  assert.deepEqual(pares(consulta.rows), reordenadas);
  assert.equal(actualizado.componentes_linea_accion, reordenadas.map(l => l.linea_accion).join('\n'));
  assert.equal(actualizado.resultados_esperados, reordenadas.map(l => l.resultado_esperado).join('\n'));
});

it('la migración de orden conserva datos existentes, identidades y archivo lógico', async () => {
  const anterior = await crearBaseProgramas({ ordenLineas: false });
  try {
    const programa = await guardar(anterior, entrada());
    await anterior.query('UPDATE public.programa_lineas_accion SET archived_at = now() WHERE id_linea_accion = $1',
      [programa.lineas_accion[0].id_linea_accion]);
    const seleccionar = orden => anterior.query(`SELECT id_linea_accion, linea_accion, resultado_esperado, archived_at
      FROM public.programa_lineas_accion WHERE id_programa = $1 ORDER BY ${orden}`, [programa.id_programa]);
    const antes = await seleccionar('created_at, id_linea_accion');
    await anterior.exec(await readFile(new URL('../../../supabase/migrations/20261003200000_fge_programas_orden_lineas.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await seleccionar('orden')).rows, antes.rows);
    await assert.rejects(anterior.query('UPDATE public.programa_lineas_accion SET orden = -1'), error => error.code === '23514');
  } finally { await anterior.close(); }
});

it('crea, consulta y actualiza pares con auditoría y versión', async () => {
  const creado = await guardar(db, entrada());
  assert.equal(creado.version, 1);
  assert.equal(creado.created_by, usuarios.ADMIN);
  assert.equal(creado.lineas_accion.length, 2);
  const conservada = creado.lineas_accion[1];
  const actualizado = await guardar(db, {
    descripcion: 'Actualizada',
    lineas_accion: [
      { linea_accion: conservada.linea_accion, resultado_esperado: 'Nuevo resultado' },
      { linea_accion: 'Línea nueva', resultado_esperado: 'Resultado nuevo' },
    ],
  }, creado.id_programa, 1);
  assert.equal(actualizado.version, 2);
  assert.equal(actualizado.lineas_accion.length, 2);
  assert.equal(actualizado.lineas_accion[0].id_linea_accion, conservada.id_linea_accion);
  assert.equal(actualizado.lineas_accion[0].resultado_esperado, 'Nuevo resultado');
  assert.equal(actualizado.componentes_linea_accion, `${conservada.linea_accion}\nLínea nueva`);
  const visiblesCoordinador = await comoUsuario(db, 'COORD', tx => tx.query(
    'SELECT * FROM public.programa_lineas_accion WHERE id_programa = $1', [creado.id_programa]));
  assert.equal(visiblesCoordinador.rows.length, 2);
  assert.ok(visiblesCoordinador.rows.every(linea => linea.archived_at === null));
  const auditoria = await db.query("SELECT count(*)::int AS cantidad FROM fge_private.historial_cambios WHERE tabla_afectada = 'programa_lineas_accion' AND id_usuario = $1", [usuarios.ADMIN]);
  assert.ok(auditoria.rows[0].cantidad >= 4);
});

it('acepta las referencias ODS y ESG que envía el formulario vigente', async () => {
  const creado = await guardar(db, {
    ...entrada(),
    referencias_ods: 'ODS 4 y ODS 11',
    referencias_esg: 'Impacto social',
  });
  assert.equal(creado.referencias_ods, 'ODS 4 y ODS 11');
  assert.equal(creado.referencias_esg, 'Impacto social');
});

it('una línea inválida revierte incluso el programa creado o actualizado', async () => {
  const antes = (await db.query('SELECT count(*)::int AS cantidad FROM public.programas')).rows[0].cantidad;
  const invalido = entrada();
  invalido.lineas_accion[1].resultado_esperado = ' ';
  await assert.rejects(guardar(db, invalido), error => error.code === '23514');
  assert.equal((await db.query('SELECT count(*)::int AS cantidad FROM public.programas')).rows[0].cantidad, antes);
  const programa = await guardar(db, entrada());
  await assert.rejects(guardar(db, { ...invalido, descripcion: 'No debe guardarse' }, programa.id_programa, 1), error => error.code === '23514');
  const consulta = await db.query('SELECT descripcion, version FROM public.programas WHERE id_programa = $1', [programa.id_programa]);
  assert.equal(consulta.rows[0].descripcion, 'Descripción');
  assert.equal(Number(consulta.rows[0].version), 1);
  const lineas = await db.query('SELECT resultado_esperado FROM public.programa_lineas_accion WHERE id_programa = $1 AND archived_at IS NULL ORDER BY created_at', [programa.id_programa]);
  assert.deepEqual(
    lineas.rows.map(fila => fila.resultado_esperado).sort(),
    entrada().lineas_accion.map(fila => fila.resultado_esperado).sort(),
  );
});

it('conflictos, inexistentes y archivados no alteran datos', async () => {
  const programa = await guardar(db, entrada());
  await guardar(db, { nombre: 'Nueva versión' }, programa.id_programa, 1);
  await assert.rejects(guardar(db, { nombre: 'Obsoleta' }, programa.id_programa, 1), error => error.code === '40001');
  await assert.rejects(guardar(db, { nombre: 'No existe' }, '00000000-0000-4000-8000-000000000000'), error => error.code === 'P0002');
  await db.query('UPDATE public.programas SET archived_at = now() WHERE id_programa = $1', [programa.id_programa]);
  await assert.rejects(guardar(db, { nombre: 'Archivado' }, programa.id_programa), error => error.code === 'P0002');
});

it('el coordinador puede leer pero no guardar; el anónimo no puede ejecutar la RPC', async () => {
  const programa = await guardar(db, entrada());
  const lectura = await comoUsuario(db, 'COORD', tx => tx.query('SELECT nombre FROM public.programas WHERE id_programa = $1', [programa.id_programa]));
  assert.equal(lectura.rows.length, 1);
  await assert.rejects(guardar(db, entrada(), null, null, 'COORD'), error => error.code === '42501');
  await assert.rejects(guardar(db, { nombre: 'Sin permiso' }, programa.id_programa, 1, 'COORD'), error => error.code === '42501');
  await assert.rejects(db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE anon');
    await tx.query('SELECT public.guardar_programa_completo($1::jsonb)', [JSON.stringify(entrada())]);
  }), error => error.code === '42501');
});

it('preserva componentes legados al editar sin líneas y valida llamadas directas', async () => {
  const { rows: [legado] } = await db.query('SELECT * FROM public.programas WHERE created_by IS NULL LIMIT 1');
  const actualizado = await guardar(db, { nombre: 'Legado editado' }, legado.id_programa, Number(legado.version));
  assert.equal(actualizado.componentes_linea_accion, legado.componentes_linea_accion);
  assert.equal(actualizado.resultados_esperados, legado.resultados_esperados);
  assert.deepEqual(actualizado.lineas_accion, []);
  for (const datos of [{}, { nombre: null }, { lineas_accion: [] }, { lineas_accion: null }, { version: 10 }, { nombre: 'a'.repeat(151) }]) {
    await assert.rejects(guardar(db, datos, legado.id_programa), error => error.code === '22023');
  }
  const duplicado = entrada(); duplicado.lineas_accion[1].linea_accion = ' formación ';
  await assert.rejects(guardar(db, duplicado), error => error.code === '23505');
});
