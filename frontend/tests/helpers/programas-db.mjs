import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

export const usuarios = {
  ADMIN: '17600000-0000-4000-8000-000000000001',
  COORD: '17600000-0000-4000-8000-000000000002',
};

/** PostgreSQL embebido con migraciones reales; Auth y Storage solo tienen su soporte mínimo. */
export async function crearBaseProgramas() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);
  const migraciones = [
    '20260908002323_fge_estructura.sql',
    '20260908002327_fge_auditoria_indices.sql',
    '20260922111500_fge_programas_storage_rls.sql',
    '20260923014926_fge_relaciones_planes_programas.sql',
    '20260923020339_fge_auditoria_escrituras_autorizadas.sql',
    '20260923151202_fge_programa_lineas_accion.sql',
    '20260924120000_fge_programas_referencias.sql',
    '20260925120000_fge_guardar_programa_completo.sql',
    '20260928222053_fge_sincronizar_guardado_programas.sql',
  ];
  for (const nombre of migraciones) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${nombre}`, import.meta.url), 'utf8'));
  }
  await db.exec(await readFile(new URL('../../../supabase/seed.sql', import.meta.url), 'utf8'));
  for (const [rol, id] of Object.entries(usuarios)) {
    await db.query('INSERT INTO auth.users VALUES ($1)', [id]);
    await db.query('INSERT INTO public.perfiles (id_usuario, nombre) VALUES ($1, $2)', [id, `QA ${rol}`]);
    await db.query(`INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, otorgado_por)
      SELECT $1, id_rol, 'global', $1 FROM public.roles WHERE codigo = $2`, [id, rol]);
  }
  return db;
}

export function comoUsuario(db, rol, operacion) {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [usuarios[rol]]);
    return operacion(tx);
  });
}

export async function guardar(db, datos, id = null, version = null, rol = 'ADMIN') {
  return comoUsuario(db, rol, async tx => {
    const resultado = await tx.query('SELECT public.guardar_programa_completo($1::jsonb, $2::uuid, $3::bigint) AS programa', [JSON.stringify(datos), id, version]);
    return resultado.rows[0].programa;
  });
}
