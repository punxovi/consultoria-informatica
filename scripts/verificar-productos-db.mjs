// PostgreSQL real embebido; Auth y Storage tienen el soporte mínimo de pruebas.
// No se conecta a Supabase remoto ni modifica datos del usuario.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const id = n => `16100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [admin, coord, guest, noRole, orgCL, orgAR, product, service, catalogImage] = Array.from({ length: 9 }, (_, i) => id(i + 1));
let checks = 0;
let cl, ar;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const scalar = async (sql, values = []) => Object.values((await db.query(sql, values)).rows[0])[0];
const reject = async (sql, values, code) => { await assert.rejects(db.query(sql, values), error => error.code === code); checks++; };
const load = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
const user = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]); await db.exec('SET ROLE authenticated'); };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA storage TO authenticated, anon;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb, UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
  for (const name of [
    '20260908002323_fge_estructura.sql', '20260908002327_fge_auditoria_indices.sql',
    '20260908002329_fge_paises_storage.sql', '20260909000848_fge_catalogo_cotizaciones.sql',
    '20260922111500_fge_programas_storage_rls.sql', '20260923014926_fge_relaciones_planes_programas.sql',
    '20260923020339_fge_auditoria_escrituras_autorizadas.sql', '20260928223251_fge_planes_actions_rls.sql',
    '20260929090000_fge_acciones_actions_rls.sql', '20261002120000_fge_reforzar_rls_planes_acciones.sql',
    '20261002225129_fge_planes_periodo_anual.sql', '20261023150000_fge_paises_catalogo_dashboard.sql',
  ]) await load(name);
  // Las funciones territoriales vigentes requieren la zona horaria de SCRUM-149.
  // Se incluye esa columna sin simular las funciones de autorización.
  await db.exec("ALTER TABLE public.paises ADD COLUMN zona_horaria text NOT NULL DEFAULT 'UTC'");
  await load('20261029100000_fge_autorizacion_territorial_caducidad.sql');
  await load('20261102120000_fge_consulta_transversal_coordinadores.sql');
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2),($3),($4)', [admin, coord, guest, noRole]);
  await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES($1,'ADMIN QA'),($2,'COORD QA'),($3,'INVIT QA'),($4,'Sin rol QA')", [admin, coord, guest, noRole]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.exec("INSERT INTO public.roles(codigo,nombre) VALUES('ADMIN','Administrador'),('COORD','Coordinador'),('INVIT','Invitado')");
  cl = await scalar("SELECT id_pais FROM public.paises WHERE codigo_iso='CL'");
  ar = await scalar("SELECT id_pais FROM public.paises WHERE codigo_iso='AR'");
  await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'global',NULL,$1 FROM public.roles WHERE codigo='ADMIN'", [admin]);
  for (const [uid, role] of [[coord, 'COORD'], [guest, 'INVIT']]) {
    await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'pais',$2,$3 FROM public.roles WHERE codigo=$4", [uid, cl, admin, role]);
  }
  await db.query(`INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
    VALUES($1,$3,'Organización CL QA','QA','123','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','comedor_merendero',10),
    ($2,$4,'Organización AR QA','QA','123','qa@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','comedor_merendero',10)`, [orgCL, orgAR, cl, ar]);
  // Filas anteriores a la migración: UUID, imágenes y referencias deben sobrevivir.
  await db.query("INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,publicado) VALUES($1,$2,'Bolso previo','Hecho a mano','unidad',true)", [product, orgCL]);
  await db.query("INSERT INTO public.archivos(id_archivo,id_producto,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria,estado_carga) VALUES($1,$2,'productos/previa.png','previa.png','image/png',100,'imagen_producto','disponible')", [catalogImage, product]);
  await db.transaction(async tx => {
    await tx.query("INSERT INTO public.solicitudes_cotizacion(id_solicitud,nombre_solicitante,correo) VALUES($1,'QA','qa@example.invalid')", [id(20)]);
    await tx.query('INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud,id_producto,cantidad) VALUES($1,$2,2)', [id(20), product]);
  });
} catch (error) {
  await db.close();
  throw error;
}
try {
  await load('20261103150000_fge_scrum161_catalogo_productos.sql');
  await user(admin);
  check(await scalar('SELECT id_producto FROM public.productos WHERE id_producto=$1', [product]), product);
  check(await scalar('SELECT tipo_item FROM public.productos WHERE id_producto=$1', [product]), 'producto');
  check(await scalar('SELECT caracteristicas FROM public.productos WHERE id_producto=$1', [product]), {});
  check(await scalar('SELECT count(*)::int FROM public.archivos WHERE id_producto=$1', [product]), 1);
  await db.query(`INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,tipo_item,categoria,material_terminacion,caracteristicas,informacion_adicional)
    VALUES($1,$2,'Taller comunitario','Servicio de capacitación','sesión','servicio','Capacitación','Presencial','{"duracion":"2 horas","idiomas":["es"]}','Adaptable a grupos')`, [service, orgAR]);
  check(await scalar('SELECT id_pais FROM public.productos_por_territorio WHERE id_producto=$1', [service]), ar);
  await db.exec('RESET ROLE');
  await db.query('UPDATE public.organizaciones SET id_pais=$1 WHERE id_organizacion=$2', [cl, orgAR]);
  check(await scalar('SELECT id_pais FROM public.productos_por_territorio WHERE id_producto=$1', [service]), cl);
  await db.query('UPDATE public.organizaciones SET id_pais=$1 WHERE id_organizacion=$2', [ar, orgAR]);
  await user(admin);
  check(await scalar('SELECT count(*)::int FROM public.productos_por_territorio WHERE id_organizacion=$1', [orgCL]), 1);
  check(await scalar('SELECT count(*)::int FROM public.productos_por_territorio WHERE id_pais=$1', [ar]), 1);
  check(await scalar('SELECT publicado FROM public.productos WHERE id_producto=$1', [service]), false);
  await db.query('UPDATE public.productos SET publicado=true WHERE id_producto=$1', [service]);
  check(await scalar('SELECT publicado FROM public.productos WHERE id_producto=$1', [service]), true);
  for (const [changes, code] of [["nombre=' '", '23514'], ["descripcion=' '", '23514'], ["categoria=' '", '23514'], ["material_terminacion=' '", '23514'], ["informacion_adicional=' '", '23514'], ["tipo_item='stock'", '23514'], ["caracteristicas='[]'::jsonb", '23514'], ["caracteristicas='null'::jsonb", '23514'], ["caracteristicas=NULL", '23502']]) {
    await reject(`UPDATE public.productos SET ${changes} WHERE id_producto=$1`, [service], code);
  }
  await reject('UPDATE public.productos SET id_organizacion=$1 WHERE id_producto=$2', [orgCL, service], '23514');
  await reject('UPDATE public.productos SET id_producto=$1 WHERE id_producto=$2', [id(99), service], '23514');
  await reject("INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida) VALUES($1,'A','B','unidad')", [id(98)], '42501');
  await reject('DELETE FROM public.productos WHERE id_producto=$1', [service], '42501');

  const image = id(30), path = `productos/${product}/${id(31)}.png`;
  await db.query("INSERT INTO public.archivos(id_archivo,id_producto,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria) VALUES($1,$2,$3,'foto.png','image/png',100,'imagen_producto')", [image, product, path]);
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('fge-archivos',$1)", [path]);
  check(await scalar("SELECT count(*)::int FROM storage.objects WHERE name=$1", [path]), 0); // reservado aún no se entrega
  await db.query("UPDATE public.archivos SET estado_carga='disponible' WHERE id_archivo=$1", [image]);
  check(await scalar('SELECT count(*)::int FROM public.archivos WHERE id_producto=$1', [product]), 2);
  check(await scalar('SELECT count(*)::int FROM storage.objects WHERE name=$1', [path]), 1);
  await reject("INSERT INTO storage.objects(bucket_id,name) VALUES('fge-archivos','productos/ajeno.png')", [], '42501');
  await reject('UPDATE public.archivos SET id_producto=$1 WHERE id_archivo=$2', [service, image], '23514');
  await reject('UPDATE public.archivos SET ruta_objeto=$1 WHERE id_archivo=$2', [`productos/${product}/${id(32)}.png`, image], '23514');
  for (const [ruta, mime, size] of [[`productos/${service}/${id(32)}.png`, 'image/png', 100], [path + '.exe', 'image/png', 100], [`productos/${product}/${id(32)}.png`, 'application/pdf', 100], [`productos/${product}/${id(32)}.png`, 'image/png', 0], [`productos/${product}/${id(32)}.png`, 'image/png', 5242881]]) {
    await reject("INSERT INTO public.archivos(id_producto,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria) VALUES($1,$2,'foto.png',$3,$4,'imagen_producto')", [product, ruta, mime, size], '23514');
  }
  await user(coord);
  check(await scalar('SELECT count(*)::int FROM public.productos_por_territorio'), 2); // consulta transversal vigente
  check((await db.query("UPDATE public.productos SET nombre='Cambio fuera de país' WHERE id_producto=$1 RETURNING id_producto", [service])).rows.length, 0);
  await db.query("UPDATE public.productos SET informacion_adicional='Edición autorizada' WHERE id_producto=$1", [product]);
  check(await scalar('SELECT informacion_adicional FROM public.productos WHERE id_producto=$1', [product]), 'Edición autorizada');
  await user(guest);
  check(await scalar('SELECT count(*)::int FROM public.productos_por_territorio'), 1);
  await reject("INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida) VALUES($1,'A','B','unidad')", [orgCL], '42501');
  check((await db.query("UPDATE public.productos SET publicado=false WHERE id_producto=$1 RETURNING id_producto", [product])).rows.length, 0);
  await user(noRole);
  check(await scalar('SELECT count(*)::int FROM public.productos'), 0);
  check(await scalar('SELECT count(*)::int FROM public.archivos WHERE id_producto IS NOT NULL'), 0);
  check(await scalar('SELECT count(*)::int FROM storage.objects'), 0);
  await db.exec('RESET ROLE; SET ROLE anon');
  await reject('SELECT * FROM public.productos', [], '42501');
  await reject('SELECT * FROM public.productos_por_territorio', [], '42501');
  await user(admin);
  await db.query('UPDATE public.archivos SET archived_at=now() WHERE id_archivo=$1', [image]);
  check(await scalar('SELECT count(*)::int FROM storage.objects WHERE name=$1', [path]), 0);
  await db.query('UPDATE public.productos SET archived_at=now(),publicado=false WHERE id_producto=$1', [product]);
  check(await scalar('SELECT count(*)::int FROM public.productos_por_territorio WHERE id_producto=$1', [product]), 0);
  await db.exec('RESET ROLE');
  check(await scalar('SELECT nombre_producto FROM public.solicitud_cotizacion_detalles WHERE id_producto=$1', [product]), 'Bolso previo');
  check(await scalar('SELECT count(*)::int FROM public.productos WHERE id_producto=$1', [product]), 1); // archivado conserva persistencia
  check(await scalar("SELECT count(*)::int > 0 FROM fge_private.historial_cambios WHERE tabla_afectada='productos'"), true);
  check(await scalar("SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='productos' AND column_name IN ('stock','inventario','compras','despacho','id_pais')"), 0);
  check(await scalar("SELECT public FROM storage.buckets WHERE id='fge-archivos'"), false);
  const remoteCheck = await db.exec(await readFile(new URL('../supabase/tests/database/040_scrum161_verificacion_remota.sql', import.meta.url), 'utf8'));
  const result = remoteCheck.flatMap(r => r.rows).find(r => r.resultado)?.resultado;
  check(result?.resultado, 'OK');
  check(result?.multiples_imagenes, 2);
  check(await scalar("SELECT count(*)::int FROM public.productos WHERE nombre='QA SCRUM-161'"), 0);
  await db.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1', [admin]);
  await user(admin);
  check(await scalar('SELECT count(*)::int FROM public.productos'), 0);
  console.log(JSON.stringify({ ok: true, checks, engine: 'PostgreSQL/PGlite', remoteSupabaseModified: false }));
  if (process.argv.includes('--scrum162')) {
    await db.exec('RESET ROLE');
    await db.query('UPDATE public.perfiles SET activo=true WHERE id_usuario=$1', [admin]);
    await load('20261103160000_fge_scrum162_operaciones_productos.sql');
    const { verifyProductOperations } = await import('./verificar-operaciones-productos-db.mjs');
    const operations = await verifyProductOperations(db, { admin, coord, guest, noRole, cl, ar, orgCL, orgAR, service });
    console.log(JSON.stringify({ scrum162: true, ...operations }));
  }
} finally { await db.close(); }
