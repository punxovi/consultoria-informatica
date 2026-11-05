import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, usuarios } from '../helpers/programas-db.mjs';

test('certificados: migración real, partes, integridad, RLS y auditoría en PostgreSQL aislado', async t => {
  const db = await crearBaseProgramas();
  try {
    for (const name of [
      '20260916221136_organizaciones_datos_parciales_20260916.sql',
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql', '20261004185001_fge_permisos_organizaciones.sql',
      '20261019120000_fge_donaciones_respaldos.sql', '20261019130000_fge_scrum134_donaciones_rls.sql',
      '20261020120000_fge_scrum130_donaciones_recursos.sql',
      '20261021120000_fge_scrum131_autorizacion_donaciones.sql',
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    const country = randomUUID(), otherCountry = randomUUID(), org = randomUUID();
    await db.query(`INSERT INTO public.paises(id_pais,codigo_iso,nombre) VALUES ($1,'CL','Chile'),($2,'AR','Argentina')`, [country, otherCountry]);
    await db.query(`INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve)
      VALUES ($1,$2,'QA Certificados','Representante','123','Comunidad','QA')`, [org, country]);
    const received = (await comoUsuario(db, 'ADMIN', tx => tx.query(`INSERT INTO public.donaciones
      (id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,monto,moneda)
      VALUES ($1,'2026-11-05','recibida','Empresa QA','Aporte QA','dinero',100,'CLP') RETURNING *`, [org]))).rows[0];
    const before = await db.query('SELECT * FROM public.donaciones WHERE id_donacion=$1', [received.id_donacion]);
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261105010000_fge_donaciones_partes_certificados.sql', import.meta.url), 'utf8'));

    await t.test('conserva registros históricos y deriva país, emisor y receptor sin duplicar información', async () => {
      assert.deepEqual((await db.query('SELECT * FROM public.donaciones WHERE id_donacion=$1', [received.id_donacion])).rows, before.rows);
      const result = (await comoUsuario(db,'ADMIN',tx => tx.query('SELECT * FROM public.donaciones_partes WHERE id_donacion=$1',[received.id_donacion]))).rows[0];
      assert.deepEqual(result.emisor, { tipo: 'contraparte', nombre: 'Empresa QA' });
      assert.deepEqual(result.receptor, { tipo: 'organizacion', id_organizacion: org, id_pais: country });
      await comoUsuario(db,'ADMIN',tx => tx.query("UPDATE public.donaciones SET tipo_movimiento='entregada' WHERE id_donacion=$1",[received.id_donacion]));
      const next = (await comoUsuario(db,'ADMIN',tx => tx.query('SELECT * FROM public.donaciones_partes WHERE id_donacion=$1',[received.id_donacion]))).rows[0];
      assert.deepEqual(next.emisor, result.receptor);
      assert.deepEqual(next.receptor, result.emisor);
      await assert.rejects(db.query('UPDATE public.donaciones SET id_pais=$1 WHERE id_donacion=$2',[otherCountry,received.id_donacion]), {code:'23503'});
    });
    const reserve = async (type = 'certificado') => {
      const id = randomUUID();
      return (await comoUsuario(db,'ADMIN',tx => tx.query(`INSERT INTO public.archivos
        (id_archivo,id_donacion,bucket_id,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria,tipo_respaldo,descripcion)
        VALUES ($1,$2,'fge-archivos',$3,'documento.pdf','application/pdf',20,$4,$4,'Respaldo QA') RETURNING *`,
      [id,received.id_donacion,`donaciones/${received.id_donacion}/${id}.pdf`,type]))).rows[0];
    };
    let certificate;
    await t.test('rechaza reservas con estado final, tamaño, MIME o ruta inválidos', async () => {
      for (const changes of [
        { state: 'disponible' }, { size: 0 }, { size: 52428801 },
        { mime: 'text/plain' }, { suffix: 'ajeno.pdf' },
      ]) {
        const id = randomUUID();
        await assert.rejects(comoUsuario(db,'ADMIN',tx => tx.query(`INSERT INTO public.archivos
          (id_archivo,id_donacion,bucket_id,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria,tipo_respaldo,estado_carga)
          VALUES ($1,$2,'fge-archivos',$3,'certificado.pdf',$4,$5,'certificado','certificado',$6)`,
        [id,received.id_donacion,`donaciones/${received.id_donacion}/${changes.suffix ?? `${id}.pdf`}`,
          changes.mime ?? 'application/pdf',changes.size ?? 20,changes.state ?? 'reservado'])), {code:'23514'});
      }
    });
    await t.test('asocia múltiples certificados y respaldos con metadatos independientes', async () => {
      certificate = await reserve();
      const second = await reserve();
      await reserve('comprobante');
      assert.notEqual(certificate.id_archivo,second.id_archivo);
      assert.equal(certificate.created_by, usuarios.ADMIN);
      assert.equal(certificate.estado_carga,'reservado');
      assert.equal((await comoUsuario(db,'ADMIN',tx => tx.query('SELECT * FROM public.archivos WHERE id_donacion=$1',[received.id_donacion]))).rows.length,3);
    });
    await t.test('no permite reasociar, borrar la asociación ni cambiar la identidad física', async () => {
      for (const field of ["id_donacion=NULL,id_organizacion='"+org+"',categoria='otro_organizacion'", "ruta_objeto='donaciones/otra/ruta.pdf'", "mime_type='image/png'", 'tamano_bytes=99', "tipo_respaldo='comprobante',categoria='comprobante'", "nombre_original='otro.pdf'"]) {
        await assert.rejects(comoUsuario(db,'ADMIN',tx => tx.query(`UPDATE public.archivos SET ${field} WHERE id_archivo=$1`,[certificate.id_archivo])), {code:'23514'});
      }
    });
    await t.test('conserva el ciclo de carga, reintentos y auditoría sin reemplazar el documento', async () => {
      for (const state of ['fallido','reservado','disponible']) {
        await comoUsuario(db,'ADMIN',tx => tx.query('UPDATE public.archivos SET estado_carga=$1 WHERE id_archivo=$2',[state,certificate.id_archivo]));
      }
      await assert.rejects(comoUsuario(db,'ADMIN',tx => tx.query("UPDATE public.archivos SET estado_carga='reservado' WHERE id_archivo=$1",[certificate.id_archivo])),{code:'23514'});
      const history=(await db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='archivos' AND clave_registro->>'id_archivo'=$1",[certificate.id_archivo])).rows;
      assert.equal(history.length,4);
      assert.ok(history.every(row => row.id_usuario === usuarios.ADMIN));
    });
    await t.test('la nueva vista mantiene aislamiento RLS y niega acceso anónimo', async () => {
      const stranger=randomUUID();
      await db.query('INSERT INTO auth.users(id) VALUES ($1)',[stranger]);
      await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES ($1,'Sin rol')",[stranger]);
      await db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[stranger]);
        assert.equal((await tx.query('SELECT * FROM public.donaciones_partes')).rows.length,0);
      });
      await assert.rejects(db.transaction(async tx => {await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM public.donaciones_partes');}),{code:'42501'});
    });
    await t.test('el archivado conserva documentos e impide nuevas reservas', async () => {
      const version=(await db.query('SELECT version FROM public.donaciones WHERE id_donacion=$1',[received.id_donacion])).rows[0].version;
      await comoUsuario(db,'ADMIN',tx => tx.query('SELECT public.archivar_donacion_segura($1,$2)',[received.id_donacion,version]));
      const files=(await db.query('SELECT * FROM public.archivos WHERE id_donacion=$1',[received.id_donacion])).rows;
      assert.equal(files.length,3);
      assert.ok(files.every(file => file.archived_at));
      await assert.rejects(reserve());
    });
  } finally { await db.close(); }
});
