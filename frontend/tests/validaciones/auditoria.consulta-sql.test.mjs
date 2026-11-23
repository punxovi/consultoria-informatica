import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = (n) => `16000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), COORD_CL = id(2), COORD_AR = id(3), SIN_ROL = id(4);
const CHILE = id(11), ARGENTINA = id(12), PERU = id(13);
const ASIG_ADMIN = id(21), ASIG_CL = id(22), ASIG_AR = id(23);
const COBERTURA_AR = id(31);

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA fge_private;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.perfiles (id_usuario uuid PRIMARY KEY, nombre text, activo boolean DEFAULT true, archived_at timestamptz);
    CREATE TABLE public.roles (id_rol uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text, activo boolean DEFAULT true, archived_at timestamptz);
    CREATE TABLE public.paises (id_pais uuid PRIMARY KEY, nombre text, codigo_iso text);
    CREATE TABLE public.asignaciones_roles (id_asignacion uuid PRIMARY KEY, id_usuario uuid, id_rol uuid, alcance text,
      id_pais uuid, revocado_at timestamptz, archived_at timestamptz);
    CREATE TABLE public.permisos_temporales (id_permiso_temporal uuid PRIMARY KEY, id_pais uuid);
    CREATE TABLE fge_private.historial_cambios (
      id_historial_cambio bigserial PRIMARY KEY, tabla_afectada text NOT NULL, clave_registro jsonb, tipo_accion text NOT NULL,
      id_usuario uuid, codigo_rol text, fecha_hora timestamptz NOT NULL, ip_origen inet, antes jsonb, despues jsonb,
      id_asignacion uuid, id_permiso_temporal uuid);
  `);
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261106120000_fge_auditoria_filtros_zona_horaria.sql', import.meta.url), 'utf8'));
  await db.exec(`
    INSERT INTO auth.users VALUES ('${ADMIN}', 'admin@prueba.com'), ('${COORD_CL}', 'coordinador@prueba.com'),
      ('${COORD_AR}', 'coordinadorar@prueba.com'), ('${SIN_ROL}', 'invitado@prueba.com');
    INSERT INTO public.perfiles (id_usuario, nombre) VALUES ('${ADMIN}', 'Administrador'), ('${COORD_CL}', 'Coordinador de Prueba'),
      ('${COORD_AR}', 'Juan Pérez'), ('${SIN_ROL}', 'Invitado');
    INSERT INTO public.roles (codigo) VALUES ('ADMIN'), ('COORD');
    INSERT INTO public.paises VALUES ('${CHILE}', 'Chile', 'CL'), ('${ARGENTINA}', 'Argentina', 'AR'), ('${PERU}', 'Perú', 'PE');
    INSERT INTO public.asignaciones_roles (id_asignacion, id_usuario, id_rol, alcance, id_pais)
      SELECT '${ASIG_ADMIN}'::uuid, '${ADMIN}'::uuid, id_rol, 'global', NULL::uuid FROM public.roles WHERE codigo = 'ADMIN'
      UNION ALL SELECT '${ASIG_CL}'::uuid, '${COORD_CL}'::uuid, id_rol, 'pais', '${CHILE}'::uuid FROM public.roles WHERE codigo = 'COORD'
      UNION ALL SELECT '${ASIG_AR}'::uuid, '${COORD_AR}'::uuid, id_rol, 'pais', '${ARGENTINA}'::uuid FROM public.roles WHERE codigo = 'COORD';
    INSERT INTO public.permisos_temporales VALUES ('${COBERTURA_AR}', '${ARGENTINA}');
  `);
  const eventos = [
    ['e1', 'acciones', 'UPDATE', COORD_AR, '2026-11-06T02:43:00Z', { nombre: 'Prueba' }, { nombre: 'Ola' }, ASIG_AR, null],
    ['e2', 'autenticacion', 'INSERT', ADMIN, '2026-11-06T23:53:00Z', null, { operacion: 'login' }, ASIG_ADMIN, null],
    ['e3', 'organizaciones', 'INSERT', COORD_CL, '2026-11-07T00:30:00Z', null, { nombre: 'Comedor', id_pais: CHILE }, ASIG_CL, null],
    ['e4', 'informacion_legal', 'INSERT', ADMIN, '2026-11-06T15:00:00Z', null, { operacion: 'lectura_documento' }, ASIG_ADMIN, null],
    ['e5', 'planes', 'UPDATE', COORD_CL, '2026-11-06T15:10:00Z', { archived_at: null, id_pais: CHILE }, { archived_at: '2026-11-06T15:10:00Z', id_pais: CHILE }, ASIG_CL, null],
    ['e6', 'planes', 'UPDATE', COORD_CL, '2026-11-06T15:20:00Z', { archived_at: '2026-11-06T15:10:00Z', id_pais: CHILE }, { archived_at: null, id_pais: CHILE }, ASIG_CL, null],
    ['e7', 'archivos', 'DELETE', ADMIN, '2026-11-06T15:30:00Z', { nombre_original: 'a.pdf' }, null, ASIG_ADMIN, null],
    ['e8', 'organizaciones', 'UPDATE', COORD_CL, '2026-11-06T16:00:00Z', { nombre: 'X', id_pais: ARGENTINA }, { nombre: 'Y', id_pais: ARGENTINA }, ASIG_CL, COBERTURA_AR],
    ['e9', 'autenticacion', 'INSERT', COORD_CL, '2026-11-06T16:10:00Z', null, { operacion: 'login' }, null, null, { exitoso: 'false' }],
    ['e10', 'organizaciones', 'INSERT', COORD_CL, '2026-11-06T16:20:00Z', null, { nombre: 'Lima', id_pais: PERU }, ASIG_CL, null],
  ];
  for (const [ref, tabla, accion, usuario, fecha, antes, despues, asignacion, cobertura, clave] of eventos) {
    await db.query(
      `INSERT INTO fge_private.historial_cambios (tabla_afectada, clave_registro, tipo_accion, id_usuario, fecha_hora, antes, despues, id_asignacion, id_permiso_temporal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tabla, { ref, ...(clave ?? {}) }, accion, usuario, fecha, antes, despues, asignacion, cobertura],
    );
  }
});

async function consultar(filtros, actor = ADMIN) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [actor]);
  const { rows } = await db.query('SELECT public.consultar_eventos_auditoria($1::jsonb) AS r', [filtros]);
  return rows[0].r;
}
const refs = async (filtros) => (await consultar(filtros)).events.map((e) => e.referencia.match(/ref: (\w+)/)[1]).sort();

test('fechas: el día se corta en la zona horaria de quien consulta', async () => {
  const dia = { desde: '2026-11-06', hasta: '2026-11-06' };
  const enChile = await refs({ ...dia, zona_horaria: 'America/Santiago' });
  assert.ok(!enChile.includes('e1'), 'el 5-nov 23:43 (Chile) no pertenece al 6-nov');
  assert.ok(enChile.includes('e2') && enChile.includes('e3'), 'el 6-nov 20:53 y 21:30 (Chile) sí pertenecen al 6-nov');
  const enUtc = await refs(dia);
  assert.ok(enUtc.includes('e1') && !enUtc.includes('e3'));
  assert.ok(!(await refs({ desde: '2026-11-06', zona_horaria: 'America/Santiago' })).includes('e1'));
  assert.ok((await refs({ hasta: '2026-11-05', zona_horaria: 'America/Santiago' })).includes('e1'));
});

test('qué hizo: filtra por la misma categoría que muestra la pantalla', async () => {
  assert.deepEqual(await refs({ operacion: 'crear' }), ['e10', 'e3']);
  assert.deepEqual(await refs({ operacion: 'inicio_sesion' }), ['e2']);
  assert.deepEqual(await refs({ operacion: 'inicio_sesion_fallido' }), ['e9']);
  assert.deepEqual(await refs({ operacion: 'lectura_documento' }), ['e4']);
  assert.deepEqual(await refs({ operacion: 'modificar' }), ['e1', 'e8']);
  assert.deepEqual(await refs({ operacion: 'archivar' }), ['e5']);
  assert.deepEqual(await refs({ operacion: 'restaurar' }), ['e6']);
  assert.deepEqual(await refs({ operacion: 'eliminar' }), ['e7']);
});

test('país: filtra por el país que se muestra, sin distinguir tildes ni mayúsculas', async () => {
  const chile = await consultar({ pais: 'chile' });
  assert.ok(chile.events.every((e) => e.pais === 'Chile'), 'todo lo filtrado se muestra como Chile');
  assert.ok(!chile.events.some((e) => e.referencia.includes('e8')), 'la edición en Argentina por cobertura no sale en Chile');
  const argentina = await refs({ pais: 'Argentina' });
  assert.ok(argentina.includes('e8') && argentina.includes('e1'));
  assert.deepEqual(await refs({ pais: 'peru' }), ['e10']);
  assert.deepEqual(await refs({ pais: 'PE' }), ['e10']);
});

test('persona y sección: búsqueda sin tildes y sección exacta', async () => {
  assert.deepEqual(await refs({ usuario: 'perez' }), ['e1']);
  assert.deepEqual(await refs({ usuario: 'COORDINADORAR@' }), ['e1']);
  assert.deepEqual(await refs({ entidad: 'planes' }), ['e5', 'e6']);
  assert.deepEqual(await refs({ pais: 'Chile', operacion: 'crear', desde: '2026-11-06', hasta: '2026-11-06', zona_horaria: 'America/Santiago' }), ['e3']);
});

test('rechaza zona u operación inválidas y a quien no es Administrador', async () => {
  for (const filtros of [{ zona_horaria: 'Marte/Olympus' }, { operacion: 'otra' }, { operacion: 'INSERTAR' }]) {
    await assert.rejects(consultar(filtros), (e) => e.code === '22023', JSON.stringify(filtros));
  }
  await assert.rejects(consultar({}, SIN_ROL), (e) => e.code === '42501');
});

test('compatibilidad: acepta lo que envía hoy el backend en uso (valores técnicos, sin zona)', async () => {
  const actual = (operacion) => ({ usuario: null, pais: null, desde: null, hasta: null, operacion, entidad: null, limit: 50, cursor_fecha: null, cursor_id: null });
  assert.deepEqual(await refs(actual('INSERT')), ['e10', 'e3']);
  assert.deepEqual(await refs(actual('UPDATE')), ['e1', 'e5', 'e6', 'e8']);
  assert.deepEqual(await refs(actual('DELETE')), ['e7']);
  assert.deepEqual(await refs(actual('insert')), ['e10', 'e3']);
  assert.equal((await consultar(actual(null))).events.length, 10);
  assert.ok((await refs({ ...actual(null), desde: '2026-11-06', hasta: '2026-11-06' })).includes('e1'));
});
