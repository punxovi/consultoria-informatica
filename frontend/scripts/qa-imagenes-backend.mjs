import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, comoUsuario, guardar } from '../tests/helpers/programas-db.mjs';

const db = await crearBaseProgramas();
const resultados = [];
async function comprobar(caso, operacion) {
  try { await operacion(); resultados.push({ caso, resultado: 'PASA' }); }
  catch (error) { resultados.push({ caso, resultado: 'FALLA', detalle: error.message }); }
}
try {
  await db.query("INSERT INTO storage.buckets (id) VALUES ('fge-archivos')");
  const sql = await readFile(new URL('../../supabase/migrations/20260922111500_fge_programas_storage_rls.sql', import.meta.url), 'utf8');
  await db.exec(sql.match(/UPDATE storage\.buckets[\s\S]*?;/)[0]);
  const programa = await guardar(db, {
    nombre: 'QA imágenes', descripcion: 'Caso aislado', objetivo_general: 'Validar',
    objetivos_especificos: 'Validar imágenes', lineas_accion: [{ linea_accion: 'QA', resultado_esperado: 'Verificación' }],
  });
  const insertar = (bytes, mime = 'image/webp', rol = 'ADMIN', id = programa.id_programa) => comoUsuario(db, rol, tx => tx.query(
    `INSERT INTO public.archivos (id_programa,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria,estado_carga)
     VALUES ($1,$2,'prueba.webp',$3,$4,'imagen_programa','disponible') RETURNING id_archivo`,
    [id, `programas/${id}/${randomUUID()}.webp`, mime, bytes],
  ));
  await comprobar('ADMIN puede asociar metadatos WebP de 599999 bytes', async () => {
    assert.equal((await insertar(599999)).rows.length, 1);
  });
  for (const bytes of [600000, 610000, 614400]) {
    await comprobar(`Rechaza metadatos de ${bytes} bytes (requisito: menos de 600000)`, async () => {
      await assert.rejects(insertar(bytes), error => error.code === '23514');
    });
  }
  await comprobar('Rechaza metadatos de 614401 bytes', async () => {
    await assert.rejects(insertar(614401), error => error.code === '23514');
  });
  for (const mime of ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']) {
    await comprobar(`Rechaza metadatos finales ${mime}`, async () => {
      await assert.rejects(insertar(100, mime), error => error.code === '23514');
    });
  }
  await comprobar('Rechaza asociación a un programa inexistente', async () => {
    await assert.rejects(insertar(100, 'image/webp', 'ADMIN', randomUUID()), error => error.code === '23503');
  });
  await comprobar('COORD no puede insertar metadatos de imagen', async () => {
    await assert.rejects(insertar(100, 'image/webp', 'COORD'), error => error.code === '42501');
  });
  await comprobar('COORD puede consultar metadatos de imagen', async () => {
    const consulta = await comoUsuario(db, 'COORD', tx => tx.query('SELECT * FROM public.archivos'));
    assert.ok(consulta.rows.length > 0);
  });
  await comprobar('COORD no puede insertar objetos de Storage', async () => {
    await assert.rejects(comoUsuario(db, 'COORD', tx => tx.query(
      "INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,'fge-archivos',$2)",
      [randomUUID(), `programas/${programa.id_programa}/prueba.webp`],
    )), error => error.code === '42501');
  });
  await comprobar('ADMIN no puede insertar ruta con extensión GIF en Storage', async () => {
    await assert.rejects(comoUsuario(db, 'ADMIN', tx => tx.query(
      "INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,'fge-archivos',$2)",
      [randomUUID(), `programas/${programa.id_programa}/prueba.gif`],
    )), error => error.code === '42501');
  });
  const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id='fge-archivos'")).rows[0];
  console.log(JSON.stringify({
    alcance: 'Restricciones y RLS reales en PGlite; no ejecuta el servicio HTTP ni el almacenamiento binario de Supabase.',
    bucket, resultados,
    resumen: { pasa: resultados.filter(r => r.resultado === 'PASA').length, falla: resultados.filter(r => r.resultado === 'FALLA').length },
  }, null, 2));
  if (resultados.some(r => r.resultado === 'FALLA')) process.exitCode = 1;
} finally { await db.close(); }
