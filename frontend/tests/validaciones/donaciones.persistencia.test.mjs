import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

const migracion = (nombre) =>
  readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url), 'utf8');

test('Donaciones y Respaldos: persistencia, asociación documental, RLS, storage y aislamiento', async (t) => {
  const db = await crearBaseProgramas();
  try {
    await db.exec(`
      ALTER TABLE storage.buckets ADD COLUMN name text;
      ALTER TABLE storage.buckets ADD COLUMN public boolean DEFAULT false;
      ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
      ALTER TABLE storage.objects ALTER COLUMN id SET DEFAULT gen_random_uuid();
      CREATE UNIQUE INDEX IF NOT EXISTS objetos_donaciones_ruta_uq ON storage.objects(bucket_id, name);
      GRANT USAGE ON SCHEMA storage TO authenticated, anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    `);

    for (const nombre of [
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql',
      '20261004185001_fge_permisos_organizaciones.sql',
      '20261019120000_fge_donaciones_respaldos.sql',
      '20261019130000_fge_scrum134_donaciones_rls.sql',
      '20261020120000_fge_scrum130_donaciones_recursos.sql',
      '20261021120000_fge_scrum131_autorizacion_donaciones.sql',
    ]) {
      await db.exec(await migracion(nombre));
    }

    await db.exec(`
      INSERT INTO public.paises (codigo_iso, nombre) VALUES ('CL', 'Chile'), ('AR', 'Argentina');
    `);

    const paises = (await db.query('SELECT id_pais, codigo_iso FROM public.paises')).rows;
    const paiCL = paises.find((p) => p.codigo_iso === 'CL');
    const paiAR = paises.find((p) => p.codigo_iso === 'AR');

    const orgCL = (
      await comoUsuario(db, 'ADMIN', (tx) =>
        tx.query(
          `INSERT INTO public.organizaciones (
            id_pais, nombre, nombre_representante, telefono, correo,
            region_departamento, comuna_municipio_ciudad, direccion,
            publico_objetivo, descripcion_breve, tipo_organizacion, numero_beneficiarios
          ) VALUES ($1, 'Org Chile', 'Rep CL', '56912345678', 'cl@example.invalid',
                    'Metropolitana', 'Santiago', 'Calle 1', 'Comunidad', 'QA', 'centro_comunitario', 50)
          RETURNING *;`,
          [paiCL.id_pais],
        ),
      )
    ).rows[0];

    const orgAR = (
      await comoUsuario(db, 'ADMIN', (tx) =>
        tx.query(
          `INSERT INTO public.organizaciones (
            id_pais, nombre, nombre_representante, telefono, correo,
            region_departamento, comuna_municipio_ciudad, direccion,
            publico_objetivo, descripcion_breve, tipo_organizacion, numero_beneficiarios
          ) VALUES ($1, 'Org Argentina', 'Rep AR', '5411234567', 'ar@example.invalid',
                    'Buenos Aires', 'CABA', 'Av. 9 de julio', 'Comunidad', 'QA', 'centro_comunitario', 30)
          RETURNING *;`,
          [paiAR.id_pais],
        ),
      )
    ).rows[0];

    await db.query(
      "UPDATE public.asignaciones_roles SET alcance = 'pais', id_pais = $1 WHERE id_usuario = $2",
      [paiCL.id_pais, usuarios.COORD],
    );

    let donacion1Id;
    let donacion2Id;

    await t.test('SCRUM-131 preautoriza gestión con la regla territorial existente', async () => {
      const canManage = async (role, orgId) => (await comoUsuario(db, role, tx =>
        tx.query('SELECT public.puede_gestionar_donaciones($1) AS permitido', [orgId]))).rows[0].permitido;
      assert.equal(await canManage('ADMIN', orgCL.id_organizacion), true);
      assert.equal(await canManage('ADMIN', orgAR.id_organizacion), true);
      assert.equal(await canManage('COORD', orgCL.id_organizacion), true);
      assert.equal(await canManage('COORD', orgAR.id_organizacion), false);
      assert.equal(await canManage('ADMIN', 'ffffffff-ffff-4fff-8fff-ffffffffffff'), false);
      const cobertura = (await db.query(`INSERT INTO public.permisos_temporales
        (id_usuario_beneficiario,id_usuario_otorga,id_pais,inicio_at,fin_at,motivo)
        VALUES ($1,$2,$3,now()-interval '1 hour',now()+interval '1 hour','Prueba cobertura SCRUM-131') RETURNING id_permiso_temporal`,
        [usuarios.COORD,usuarios.ADMIN,paiAR.id_pais])).rows[0];
      assert.equal(await canManage('COORD', orgAR.id_organizacion), true);
      await db.query("UPDATE public.permisos_temporales SET fin_at=now()-interval '1 minute' WHERE id_permiso_temporal=$1",[cobertura.id_permiso_temporal]);
      assert.equal(await canManage('COORD', orgAR.id_organizacion), false);
      await assert.rejects(db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE anon');
        return tx.query('SELECT public.puede_gestionar_donaciones($1)', [orgCL.id_organizacion]);
      }), error => error.code === '42501');
      await db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ['ffffffff-ffff-4fff-8fff-ffffffffffff']);
        assert.equal((await tx.query('SELECT public.puede_gestionar_donaciones($1) AS permitido', [orgCL.id_organizacion])).rows[0].permitido, false);
      });
      const invitado = '13100000-0000-4000-8000-000000000005';
      await db.query('INSERT INTO auth.users(id) VALUES($1)',[invitado]);
      await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES($1,'Invitado de prueba')",[invitado]);
      await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por) SELECT $1,id_rol,'global',$2 FROM public.roles WHERE codigo='INVIT'",[invitado,usuarios.ADMIN]);
      await db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)",[invitado]);
        assert.equal((await tx.query('SELECT public.puede_gestionar_donaciones($1) AS permitido',[orgCL.id_organizacion])).rows[0].permitido,false);
      });
    });

    await t.test('persiste donación en dinero con metadatos correctos', async () => {
      const r1 = await comoUsuario(db, 'ADMIN', (tx) =>
        tx.query(
          `INSERT INTO public.donaciones (
            id_organizacion, fecha, tipo_movimiento, contraparte_nombre,
            descripcion, tipo_aporte, monto, moneda
          ) VALUES ($1, '2026-10-19', 'recibida', 'Empresa Solidaria',
                    'Aporte financiero para equipamiento', 'dinero', 500000, 'CLP')
          RETURNING *;`,
          [orgCL.id_organizacion],
        ),
      );
      assert.equal(r1.rows.length, 1);
      const d1 = r1.rows[0];
      donacion1Id = d1.id_donacion;
      assert.equal(d1.tipo_aporte, 'dinero');
      assert.equal(Number(d1.monto), 500000);
      assert.equal(d1.moneda, 'CLP');
      assert.equal(Number(d1.version), 1);
      assert.ok(d1.created_at);
    });

    await t.test('persiste donación en recurso para segunda organización', async () => {
      const r2 = await comoUsuario(db, 'ADMIN', (tx) =>
        tx.query(
          `INSERT INTO public.donaciones (
            id_organizacion, fecha, tipo_movimiento, contraparte_nombre,
            descripcion, tipo_aporte, cantidad, unidad
          ) VALUES ($1, '2026-10-19', 'entregada', 'Comedor Vecinal',
                    'Entrega de víveres e insumos', 'recurso', 25, 'cajas')
          RETURNING *;`,
          [orgAR.id_organizacion],
        ),
      );
      donacion2Id = r2.rows[0].id_donacion;
      assert.equal(r2.rows[0].tipo_aporte, 'recurso');
      assert.equal(Number(r2.rows[0].cantidad), 25);
    });

    await t.test('asocia múltiples respaldos de distintos tipos a la donación', async () => {
      const tipos = ['comprobante', 'acta_entrega', 'certificado', 'fotografia'];

      for (const tipo of tipos) {
        const ruta = `donaciones/${donacion1Id}/${tipo}.pdf`;
        const res = await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query(
            `INSERT INTO public.archivos (
              id_donacion, bucket_id, ruta_objeto, nombre_original,
              mime_type, tamano_bytes, categoria, tipo_respaldo,
              descripcion, estado_carga
            ) VALUES ($1, 'fge-archivos', $2, $3, 'application/pdf', 2048, $4, $4, $5, 'reservado')
            RETURNING *;`,
            [donacion1Id, ruta, `${tipo}_firmado.pdf`, tipo, `Documento de tipo ${tipo}`],
          ),
        );
        assert.equal(res.rows.length, 1);
        assert.equal(res.rows[0].id_donacion, donacion1Id);
        assert.equal(res.rows[0].tipo_respaldo, tipo);
        assert.equal(res.rows[0].estado_carga, 'reservado');
      }

      const respaldos = (
        await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1 ORDER BY tipo_respaldo;', [donacion1Id]),
        )
      ).rows;
      assert.equal(respaldos.length, 4);
    });

    await t.test('garantiza aislamiento: archivos de donación 1 no se mezclan con donación 2', async () => {
      await comoUsuario(db, 'ADMIN', (tx) =>
        tx.query(
          `INSERT INTO public.archivos (
            id_donacion, bucket_id, ruta_objeto, nombre_original,
            mime_type, tamano_bytes, categoria, tipo_respaldo, estado_carga
          ) VALUES ($1, 'fge-archivos', $2, 'acta_ar.pdf', 'application/pdf', 1024,
                    'acta_entrega', 'acta_entrega', 'disponible');`,
          [donacion2Id, `donaciones/${donacion2Id}/acta_ar.pdf`],
        ),
      );

      const d1Files = (
        await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1;', [donacion1Id]),
        )
      ).rows;
      assert.equal(d1Files.length, 4);
      assert.ok(d1Files.every((f) => f.id_donacion === donacion1Id));

      const d2Files = (
        await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1;', [donacion2Id]),
        )
      ).rows;
      assert.equal(d2Files.length, 1);
      assert.equal(d2Files[0].id_donacion, donacion2Id);
    });

    await t.test('RLS territorial: COORD (Chile) accede a donación 1 pero no a donación 2', async () => {
      const c1 = await comoUsuario(db, 'COORD', (tx) =>
        tx.query('SELECT * FROM public.donaciones WHERE id_donacion = $1;', [donacion1Id]),
      );
      assert.equal(c1.rows.length, 1);

      const f1 = await comoUsuario(db, 'COORD', (tx) =>
        tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1;', [donacion1Id]),
      );
      assert.equal(f1.rows.length, 4);

      const c2 = await comoUsuario(db, 'COORD', (tx) =>
        tx.query('SELECT * FROM public.donaciones WHERE id_donacion = $1;', [donacion2Id]),
      );
      assert.equal(c2.rows.length, 0);

      const f2 = await comoUsuario(db, 'COORD', (tx) =>
        tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1;', [donacion2Id]),
      );
      assert.equal(f2.rows.length, 0);
    });

    await t.test('RLS bloquea INSERT de donación en organización fuera del alcance de COORD', async () => {
      await assert.rejects(
        () =>
          comoUsuario(db, 'COORD', (tx) =>
            tx.query(
              `INSERT INTO public.donaciones (
                id_organizacion, fecha, tipo_movimiento, contraparte_nombre,
                descripcion, tipo_aporte, cantidad, unidad
              ) VALUES ($1, '2026-10-19', 'recibida', 'Intrusión', 'Desc', 'recurso', 1, 'unidad');`,
              [orgAR.id_organizacion],
            ),
          ),
        /violates row-level security policy|row-level security policy/,
      );
    });

    await t.test('transición de estado de carga: reservado → disponible incrementa versión', async () => {
      const archivo = (
        await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query('SELECT * FROM public.archivos WHERE id_donacion = $1 LIMIT 1;', [donacion1Id]),
        )
      ).rows[0];

      const actualizado = (
        await comoUsuario(db, 'ADMIN', (tx) =>
          tx.query(
            `UPDATE public.archivos SET estado_carga = 'disponible'
             WHERE id_archivo = $1 RETURNING *;`,
            [archivo.id_archivo],
          ),
        )
      ).rows[0];

      assert.equal(actualizado.estado_carga, 'disponible');
      assert.ok(Number(actualizado.version) > Number(archivo.version));
    });
    await t.test('SCRUM-131 reutiliza archivado atómico con versión, permisos y respaldos históricos', async () => {
      const current = (await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT version FROM public.donaciones WHERE id_donacion=$1',[donacion1Id]))).rows[0];
      await assert.rejects(comoUsuario(db,'COORD',tx=>tx.query('SELECT public.archivar_donacion_segura($1,$2)',[donacion2Id,1])),error=>error.code==='42501');
      await assert.rejects(comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.archivar_donacion_segura($1,$2)',[donacion1Id,Number(current.version)+1])),error=>error.code==='40001');
      await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT public.archivar_donacion_segura($1,$2)',[donacion1Id,current.version]));
      assert.ok((await db.query('SELECT archived_at FROM public.donaciones WHERE id_donacion=$1',[donacion1Id])).rows[0].archived_at);
      const files=(await db.query('SELECT archived_at FROM public.archivos WHERE id_donacion=$1',[donacion1Id])).rows;
      assert.equal(files.length,4);assert.ok(files.every(file=>file.archived_at));
      assert.equal((await comoUsuario(db,'ADMIN',tx=>tx.query('SELECT id_donacion FROM public.donaciones WHERE id_donacion=$1',[donacion1Id]))).rows.length,0);
    });
  } finally {
    await db.close();
  }
});
