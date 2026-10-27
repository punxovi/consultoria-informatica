// QA sin red. Instalar @electric-sql/pglite fuera del repositorio y pasar
// el directorio node_modules como argumento. Auth se representa con un esquema mínimo.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2], 'qa.cjs'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const admin = '14900000-0000-4000-8000-000000000001';
const coord = '14900000-0000-4000-8000-000000000002';
const chile = '14900000-0000-4000-8000-000000000003';
const extra = '14900000-0000-4000-8000-000000000004';
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const rpc = (op, input = {}) => scalar('SELECT public.administrar_paises($1,$2::jsonb)', [op, JSON.stringify(input)]);
const reject = async (sql, params, code) => { await assert.rejects(db.query(sql, params), error => error.code === code); checks++; };
const rejectRpc = (op, input, code) => reject('SELECT public.administrar_paises($1,$2::jsonb)', [op, JSON.stringify(input)], code);
const load = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await load('20260908002323_fge_estructura.sql');
  await load('20260908002327_fge_auditoria_indices.sql');
  await load('20260909192500_fge_trigger_perfiles.sql');
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$3),($2,$4)', [admin, coord, 'admin@example.invalid', 'coord@example.invalid']);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.exec("INSERT INTO public.roles(codigo,nombre) VALUES('ADMIN','Administrador'),('COORD','Coordinador');");
  await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por) SELECT $1,id_rol,'global',$1 FROM public.roles WHERE codigo='ADMIN'", [admin]);
  await db.query("INSERT INTO public.paises(id_pais,nombre,codigo_iso) VALUES($1,'Chile','CL'),($2,'País heredado','XX')", [chile, extra]);
  await db.query("INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por) SELECT $1,id_rol,'pais',$2,$3 FROM public.roles WHERE codigo='COORD'", [coord, chile, admin]);
  await load('20261023150000_fge_paises_catalogo_dashboard.sql');
  // Una relación real del modelo, creada antes de migrar, debe conservar su UUID.
  await db.query(`INSERT INTO public.organizaciones(id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
   VALUES($1,'Organización QA','Persona QA','+56912345678','qa@example.invalid','Región','Comuna','Dirección','Público','Descripción','comedor_merendero',10)`, [chile]);
  const organizationCountry = await scalar('SELECT id_pais FROM public.organizaciones');
  await load('20261027150000_fge_scrum149_paises.sql');
  const countries = await rpc('list');
  check(countries.length, 4);
  check(countries.filter(p => ['CL','AR','UY'].includes(p.codigo_iso)).length, 3);
  let cl = await rpc('get', { id_pais: chile });
  check(cl.id_pais, organizationCountry); check(cl.codigo_area_telefonica, '+56'); check(cl.zona_horaria, 'America/Santiago');
  check(countries.find(p => p.id_pais === extra).configuracion_pendiente, true);
  const baseIds = countries.filter(p => ['CL','AR','UY'].includes(p.codigo_iso)).map(p => p.id_pais).sort();
  await db.exec('SELECT fge_private.inicializar_paises_base(); SELECT fge_private.inicializar_paises_base();');
  check((await rpc('list')).filter(p => ['CL','AR','UY'].includes(p.codigo_iso)).map(p => p.id_pais).sort(), baseIds);
  check((await rpc('get', { id_pais: chile })).version, cl.version);
  const input = { nombre: 'Perú', codigo_iso: 'PE', codigo_area_telefonica: '+51', zona_horaria: 'America/Lima' };
  let pe = await rpc('create', input);
  check(pe.nombre, input.nombre); check(pe.version, 1); check(pe.configuracion_pendiente, false);
  await rejectRpc('create', input, '23505');
  await rejectRpc('create', { ...input, codigo_iso: 'ZZ', nombre: ' PERÚ ' }, '23505');
  for (const field of Object.keys(input)) { const bad = { ...input }; delete bad[field]; await rejectRpc('create', bad, '22023'); }
  for (const data of [{ ...input, codigo_area_telefonica: 51 }, { ...input, codigo_area_telefonica: '51' }, { ...input, nombre: ' ' }, { ...input, codigo_iso: 'PER' }, { ...input, nombre: 'A\nB' }]) await rejectRpc('create', data, '22023');
  await rejectRpc('create', { ...input, zona_horaria: 'America/Inexistente' }, 'P0151');
  await rejectRpc('create', { ...input, zona_horaria: '+03:00' }, 'P0151');
  await rejectRpc('get', { id_pais: '14900000-0000-4000-8000-000000000099' }, 'P0149');
  await rejectRpc('update', { id_pais: chile, version_esperada: cl.version + 1, cambios: { nombre: 'Nuevo' } }, 'P0150');
  await rejectRpc('update', { id_pais: chile, version_esperada: cl.version, cambios: { id_pais: pe.id_pais } }, '22023');
  await rejectRpc('update', { id_pais: chile, version_esperada: cl.version, cambios: {} }, '22023');
  const author = await scalar('SELECT created_by FROM public.paises WHERE id_pais=$1', [chile]);
  cl = await rpc('update', { id_pais: chile, version_esperada: cl.version, cambios: { nombre: 'Chile actualizado', codigo_area_telefonica: '+56', zona_horaria: 'America/Punta_Arenas' } });
  check(cl.nombre, 'Chile actualizado'); check(cl.id_pais, chile);
  check(await scalar('SELECT id_pais FROM public.organizaciones'), organizationCountry);
  check(await scalar('SELECT created_by FROM public.paises WHERE id_pais=$1', [chile]), author);
  check(await scalar("SELECT count(*)::int > 0 FROM fge_private.historial_cambios WHERE tabla_afectada='paises' AND tipo_accion='UPDATE'"), true);
  await db.exec('SELECT fge_private.inicializar_paises_base()');
  check((await rpc('get', { id_pais: chile })).nombre, 'Chile actualizado');
  await rejectRpc('update', { id_pais: extra, version_esperada: countries.find(p => p.id_pais === extra).version, cambios: { nombre: 'Pendiente' } }, '22023');
  const completed = await rpc('update', { id_pais: extra, version_esperada: countries.find(p => p.id_pais === extra).version, cambios: { codigo_area_telefonica: '+1', zona_horaria: 'UTC' } });
  check(completed.configuracion_pendiente, false);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [coord]);
  await db.exec('SET ROLE authenticated');
  for (const op of ['authorize','list','get','create','update']) await rejectRpc(op, input, '42501');
  check(await scalar('SELECT count(*)::int FROM public.paises'), 5); // lectura básica permitida
  await reject('SELECT zona_horaria FROM public.paises', [], '42501');
  await reject('SELECT fge_private.inicializar_paises_base()', [], '42501');
  await reject("UPDATE public.paises SET nombre='Prohibido' WHERE id_pais=$1", [chile], '42501');
  await db.exec('RESET ROLE; SET ROLE anon');
  await rejectRpc('list', {}, '42501');
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.query('UPDATE public.paises SET archived_at=now() WHERE id_pais=$1', [pe.id_pais]);
  await rejectRpc('get', { id_pais: pe.id_pais }, 'P0149');
  check((await rpc('list')).some(p => p.id_pais === pe.id_pais), false);
  // La clave raíz no puede alterarse siquiera por una escritura SQL privilegiada.
  await reject('UPDATE public.paises SET id_pais=$1 WHERE id_pais=$2', ['14900000-0000-4000-8000-000000000099', pe.id_pais], '22023');
  await db.query('UPDATE public.perfiles SET activo=false WHERE id_usuario=$1', [admin]);
  await rejectRpc('list', {}, '42501');
  console.log(JSON.stringify({ ok: true, checks, engine: 'PostgreSQL/PGlite', remoteSupabaseModified: false }));
} finally { await db.close(); }
