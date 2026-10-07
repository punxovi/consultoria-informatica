import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario } from '../helpers/programas-db.mjs';

const migracion = nombre => readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url), 'utf8');

test('expediente legal: migración real, relaciones, operaciones, RLS y auditoría', async () => {
  const db = await crearBaseProgramas();
  try {
    await db.exec(`
      ALTER TABLE storage.buckets ADD COLUMN name text;
      ALTER TABLE storage.buckets ADD COLUMN public boolean NOT NULL DEFAULT false;
    `);
    for (const nombre of [
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql',
      '20261004185001_fge_permisos_organizaciones.sql',
      '20261007120000_fge_expediente_legal.sql',
    ]) await db.exec(await migracion(nombre));

    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile')");
    const countryId = (await db.query("SELECT id_pais FROM public.paises WHERE codigo_iso='CL'")).rows[0].id_pais;
    const organization = (await comoUsuario(db, 'ADMIN', tx => tx.query(`
      INSERT INTO public.organizaciones (
        id_pais,nombre,nombre_representante,telefono,correo,region_departamento,
        comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,
        tipo_organizacion,numero_beneficiarios
      ) VALUES ($1,'Organización Legal QA','Representante','912345678',
        'legal@example.invalid','Metropolitana','Santiago','Calle QA','Comunidad',
        'Prueba persistente','centro_comunitario',25) RETURNING *
    `, [countryId]))).rows[0];

    const creation = {
      estado_personalidad_juridica: 'si', tipo_personalidad_juridica: 'Fundación',
      numero_registro: 'REG-QA-1', fecha_constitucion: '2020-01-15',
      vigencia_directiva: 'Vigente',
      documentos: [
        { tipo: 'identidad_representante', estado: 'pendiente' },
        { tipo: 'identificacion_legal', estado: 'no_aplica' },
        { tipo: 'estatutos', estado: 'pendiente' },
      ],
    };
    const legalId = (await comoUsuario(db, 'ADMIN', tx => tx.query(
      'SELECT public.guardar_expediente_legal($1::uuid,$2::jsonb,NULL) AS id',
      [organization.id_organizacion, JSON.stringify(creation)],
    ))).rows[0].id;
    const stored = (await comoUsuario(db, 'ADMIN', tx => tx.query(
      'SELECT * FROM public.informacion_legal WHERE id_informacion_legal=$1', [legalId],
    ))).rows[0];
    assert.equal(stored.id_organizacion, organization.id_organizacion);
    assert.equal(stored.numero_registro, 'REG-QA-1');
    assert.equal(Number(stored.version), 1);
    assert.equal(Number((await db.query(
      'SELECT count(*) FROM public.documentos_informacion_legal WHERE id_informacion_legal=$1', [legalId],
    )).rows[0].count), 3);

    const update = { ...creation, numero_registro: 'REG-QA-2', vigencia_directiva: 'Actualizada' };
    await comoUsuario(db, 'ADMIN', tx => tx.query(
      'SELECT public.guardar_expediente_legal($1::uuid,$2::jsonb,$3::bigint)',
      [organization.id_organizacion, JSON.stringify(update), 1],
    ));
    const updated = (await db.query(
      'SELECT numero_registro,version,created_at,updated_at FROM public.informacion_legal WHERE id_informacion_legal=$1',
      [legalId],
    )).rows[0];
    assert.equal(updated.numero_registro, 'REG-QA-2');
    assert.equal(Number(updated.version), 2);
    assert.ok(updated.created_at && updated.updated_at);

    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query(
      'SELECT public.guardar_expediente_legal($1::uuid,$2::jsonb,$3::bigint)',
      [organization.id_organizacion, JSON.stringify(update), 1],
    )), { code: '40001' });
    await assert.rejects(db.query(`
      INSERT INTO public.informacion_legal(id_organizacion,estado_personalidad_juridica)
      VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','si')
    `), { code: '23503' });
    await assert.rejects(db.query(`
      UPDATE public.documentos_informacion_legal SET estado='cargado'
      WHERE id_informacion_legal=$1 AND tipo='estatutos'
    `, [legalId]), { code: '23514' });
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE anon');
      return tx.query('SELECT * FROM public.informacion_legal');
    }), { code: '42501' });
    assert.ok(Number((await db.query(`
      SELECT count(*) FROM fge_private.historial_cambios
      WHERE tabla_afectada IN ('informacion_legal','documentos_informacion_legal')
    `)).rows[0].count) >= 5);
    const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='fge-expedientes-legales'")).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 10 * 1024 * 1024);
  } finally { await db.close(); }
});
