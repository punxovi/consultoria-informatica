import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Indica la ruta al módulo temporal @electric-sql/pglite.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
const rejects = async (sql, code) => { await assert.rejects(db.exec(sql), error => error.code === code); checks++; };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;`);
  for (const name of ['20260908002323_fge_estructura.sql', '20260908002327_fge_auditoria_indices.sql',
    '20260916221136_organizaciones_datos_parciales_20260916.sql', '20260923014926_fge_relaciones_planes_programas.sql']) {
    await db.exec(await migration(name));
  }
  await db.exec(`INSERT INTO public.paises(id_pais,codigo_iso,nombre) VALUES
    ('13000000-0000-4000-8000-000000000011','CL','Chile'),
    ('13000000-0000-4000-8000-000000000012','UY','Uruguay');
    INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve)
    VALUES ('13000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000011','Prueba','Representante','123','Comunidad','Prueba');
    INSERT INTO public.programas(id_programa,nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados)
    VALUES ('13000000-0000-4000-8000-000000000002','Programa','Prueba','Prueba','Prueba','Prueba','Prueba');
    INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,cantidad,unidad)
    VALUES ('13000000-0000-4000-8000-000000000001','2026-10-19','recibida','Donante','Recurso legado','recurso',2,'cajas');`);
  const before = (await db.query('SELECT * FROM public.donaciones')).rows[0];
  await db.exec(await migration('20261020120000_fge_scrum130_donaciones_recursos.sql'));
  const after = (await db.query('SELECT * FROM public.donaciones')).rows[0];
  for (const key of ['id_donacion','fecha','contraparte_nombre','descripcion','cantidad','unidad','created_at','created_by','archived_at']) {
    check(JSON.stringify(before[key]) === JSON.stringify(after[key]), `Preserva ${key}`);
  }
  check(after.categoria === null && after.estado === null && after.origen === null, 'No inventa datos históricos');
  check(after.id_pais === '13000000-0000-4000-8000-000000000011', 'Deriva país existente');
  const insert = changes => {
    const values = { id_organizacion: '13000000-0000-4000-8000-000000000001', fecha: '2026-10-20',
      tipo_movimiento: 'recibida', contraparte_nombre: 'Donante', descripcion: 'Prueba', tipo_aporte: 'recurso',
      categoria: 'Servicio', tipo_donante: 'empresa', origen: 'Campaña', estado: 'Comprometida', ...changes };
    const literal = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
    return `INSERT INTO public.donaciones(${Object.keys(values).join(',')}) VALUES (${Object.values(values).map(literal).join(',')})`;
  };
  for (const estado of ['Comprometida','Recibida','Entregada','Cerrada']) { await db.exec(insert({ estado })); checks++; }
  for (const categoria of ['Producto','Insumos','Otro']) { await db.exec(insert({ categoria, ...(categoria === 'Otro' ? {categoria_otro: 'Otro aporte'} : {}) })); checks++; }
  await db.exec(insert({categoria:'Dinero',tipo_aporte:'dinero',monto:10,moneda:'CLP'})); checks++;
  await db.exec(insert({valor_estimado:0,moneda_valorizacion:'CLP',metodo_valorizacion:'Declarado',id_programa:'13000000-0000-4000-8000-000000000002'})); checks++;
  for (const changes of [{categoria:'Alimentos'},{categoria:'Otro'},{categoria_otro:'No corresponde'},
    {estado:'Pendiente'},{tipo_donante:'otro'},{valor_estimado:-1,moneda_valorizacion:'CLP',metodo_valorizacion:'Prueba'},
    {valor_estimado:'NaN',moneda_valorizacion:'CLP',metodo_valorizacion:'Prueba'},
    {valor_estimado:'Infinity',moneda_valorizacion:'CLP',metodo_valorizacion:'Prueba'},
    {valor_estimado:1},{cantidad:1},{origen:' '},{categoria:'Dinero'}]) await rejects(insert(changes),'23514');
  for (const changes of [{id_pais:'13000000-0000-4000-8000-000000000012'},
    {id_pais:'ffffffff-ffff-4fff-8fff-ffffffffffff'}, {id_organizacion:'ffffffff-ffff-4fff-8fff-ffffffffffff'},
    {id_programa:'ffffffff-ffff-4fff-8fff-ffffffffffff'}]) await rejects(insert(changes),'23503');
  check(await scalar('SELECT count(*) FROM public.donaciones') === 10, 'Consulta registra solo filas válidas');
  await db.exec('UPDATE public.donaciones SET archived_at=clock_timestamp()');
  check(await scalar('SELECT count(*) FROM public.donaciones WHERE archived_at IS NOT NULL') === 10, 'Archivo conserva filas');
  check(await scalar("SELECT count(*) FROM fge_private.historial_cambios WHERE tabla_afectada='donaciones' AND despues->>'categoria'='Servicio'") > 0, 'Audita nuevos metadatos');
  console.log(JSON.stringify({ engine:'PGlite PostgreSQL aislado', checks, result:'PASS', supabaseApplied:false }));
} finally { await db.close(); }
