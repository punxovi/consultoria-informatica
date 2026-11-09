import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

const migration = name => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('SCRUM-180: traslado territorial de Organizaciones valida el nuevo país', async () => {
  const db = await crearBaseProgramas();
  try {
    for (const name of [
      '20261027150000_fge_scrum149_paises.sql',
      '20261029_permisos_temporales_historial.sql',
      '20261004185001_fge_permisos_organizaciones.sql',
      '20261029100000_fge_autorizacion_territorial_caducidad.sql',
      '20261102120000_fge_consulta_transversal_coordinadores.sql',
      '20261109140000_fge_scrum180_traslado_territorial.sql',
    ]) await db.exec(await migration(name));

    const paises = (await db.query("SELECT id_pais,codigo_iso FROM public.paises WHERE codigo_iso IN ('CL','AR') ORDER BY codigo_iso")).rows;
    assert.equal(paises.length, 2);
    const chile = paises.find(p => p.codigo_iso === 'CL').id_pais;
    const argentina = paises.find(p => p.codigo_iso === 'AR').id_pais;
    const org = (await db.query(`INSERT INTO public.organizaciones
      (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      VALUES ($1,'SCRUM-180 Chile','QA','+56123456789','qa180@example.invalid','RM','Santiago','Dirección','Comunidad','QA','centro_comunitario',10)
      RETURNING id_organizacion`, [chile])).rows[0];
    await db.query(`INSERT INTO public.organizaciones
      (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
      VALUES ($1,'SCRUM-180 Argentina','QA','+54123456789','qa180-ar@example.invalid','BA','Buenos Aires','Dirección','Comunidad','QA','centro_comunitario',10)`, [argentina]);
    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2", [chile, usuarios.COORD]);

    const updateAsCoord = () => comoUsuario(db, 'COORD', tx => tx.query(
      'UPDATE public.organizaciones SET id_pais=$1 WHERE id_organizacion=$2 RETURNING id_pais',
      [argentina, org.id_organizacion],
    ));

    await assert.rejects(updateAsCoord(), { code: '42501' });

    const coverage = (await db.query(`INSERT INTO public.permisos_temporales
      (id_usuario_beneficiario,id_usuario_otorga,id_pais,inicio_at,fin_at,motivo)
      VALUES ($1,$2,$3,now()-interval '1 hour',now()+interval '2 days','SCRUM-180 vigente')
      RETURNING id_permiso_temporal`, [usuarios.COORD, usuarios.ADMIN, argentina])).rows[0];
    assert.equal((await updateAsCoord()).rows[0].id_pais, argentina);

    await comoUsuario(db, 'ADMIN', tx => tx.query(
      'UPDATE public.organizaciones SET id_pais=$1 WHERE id_organizacion=$2', [chile, org.id_organizacion],
    ));
    await db.query(`UPDATE public.permisos_temporales
      SET revocado_at=now(),revocado_por=$1,motivo_revocacion='SCRUM-180 revocada'
      WHERE id_permiso_temporal=$2`, [usuarios.ADMIN, coverage.id_permiso_temporal]);
    await assert.rejects(updateAsCoord(), { code: '42501' });

    await db.query(`INSERT INTO public.permisos_temporales
      (id_usuario_beneficiario,id_usuario_otorga,id_pais,inicio_at,fin_at,motivo)
      VALUES ($1,$2,$3,now()-interval '3 days',now()-interval '2 days','SCRUM-180 vencida')`, [usuarios.COORD, usuarios.ADMIN, argentina]);
    await assert.rejects(updateAsCoord(), { code: '42501' });

    const lectura = await comoUsuario(db, 'COORD', tx => tx.query(
      'SELECT id_organizacion,id_pais FROM public.organizaciones WHERE id_organizacion=$1 OR id_organizacion<>$1', [org.id_organizacion],
    ));
    assert.ok(lectura.rows.length >= 2, 'el Coordinador conserva lectura transversal');
  } finally {
    await db.close();
  }
});
