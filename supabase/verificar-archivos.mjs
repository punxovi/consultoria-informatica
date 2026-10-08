// Revisión estática; no es un parser SQL ni ejecuta PostgreSQL.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(join(root,'migrations')).filter(f=>f.endsWith('.sql')).sort();
const config = readFileSync(join(root,'config.toml'),'utf8');
const seed = readFileSync(join(root,'seed.sql'),'utf8');
assert.equal(files.length,29,'Se esperaban veintinueve migraciones');
const sql = files.map(f=>readFileSync(join(root,'migrations',f),'utf8'));
const triggerPerfiles='20260909192500_fge_trigger_perfiles.sql';
const noTransactionMigrations=new Set([
 triggerPerfiles,
 '20260916143000_fge_obtener_roles_usuario.sql',
 '20260916221136_organizaciones_datos_parciales_20260916.sql',
]);
for (let i=0;i<files.length;i++) {
 assert.ok(files[i]==='20260916221136_organizaciones_datos_parciales_20260916.sql' || /^\d{14}_fge_.+\.sql$/.test(files[i]),'Nombre de migración válido');
 if (!noTransactionMigrations.has(files[i])) {
  assert.match(sql[i],/BEGIN;/);
  assert.match(sql[i],/COMMIT;/);
 }
 assert.ok(!/DROP\s+(TABLE|SCHEMA|DATABASE)/i.test(sql[i]),'Sin borrado de estructuras existentes');
 // Equilibrio de paréntesis ignorando comentarios y literales.
 const plain=sql[i].replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 let depth=0;
 for(const c of plain) { if(c==='(')depth++; if(c===')')depth--; assert.ok(depth>=0,'Paréntesis'); }
 assert.equal(depth,0,'Paréntesis equilibrados');
}
const allSql=sql.join('\n');
const tables=[...allSql.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)];
assert.equal(tables.length,28,'28 tablas public');
const known=new Set();
for(const [,name,body] of tables) {
 assert.ok(!known.has(name),'Tabla única');
 known.add(name); // Permitir FK a la propia tabla.
 for(const m of body.matchAll(/REFERENCES public\.(\w+)\((\w+)\)/g)) {
  assert.ok(known.has(m[1]),'FK creada después de su destino: '+name+' -> '+m[1]);
  const target=tables.find(t=>t[1]===m[1]);
  assert.ok(new RegExp('\\b'+m[2]+'\\s+uuid').test(target[2]),'FK UUID compatible');
 }
 assert.ok(allSql.includes('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;'),'RLS '+name);
 assert.ok(allSql.includes('REVOKE ALL ON TABLE public.'+name+' FROM PUBLIC, anon, authenticated;'),'Cierre '+name);
 assert.ok(allSql.includes('BEFORE INSERT OR UPDATE ON public.'+name),'Sellado '+name);
 assert.ok(allSql.includes('AFTER INSERT OR UPDATE OR DELETE ON public.'+name),'Auditoría '+name);
}
const body=n=>tables.find(t=>t[1]===n)[2];
// La migración inicial es histórica: el esquema final se verifica abajo.
assert.match(body('programas'),/id_organizacion uuid NOT NULL/);
assert.ok(!body('planes').includes('id_organizacion'));
assert.ok(!known.has('organizacion_programas'));
const relacionesSql=sql.find(s=>s.includes('ALTER TABLE public.programas DROP COLUMN id_organizacion'));
assert.ok(relacionesSql,'Existe migración que desacopla Programas de Organizaciones');
assert.match(relacionesSql,/ALTER TABLE public\.planes ADD COLUMN id_organizacion uuid/);
assert.match(relacionesSql,/FOREIGN KEY \(id_organizacion\)[\s\S]*?REFERENCES public\.organizaciones\(id_organizacion\)/);
assert.match(relacionesSql,/Hay planes asociados a la organización ficticia/,'Migración bloquea planes sin organización verificable');
assert.match(relacionesSql,/CREATE INDEX planes_id_organizacion_fk_idx/);
const lineasSql=sql.find(s=>s.includes('CREATE TABLE public.programa_lineas_accion'));
assert.ok(lineasSql,'Existe migración de líneas de acción de Programas');
assert.match(lineasSql,/resultado_esperado text NOT NULL/);
assert.match(lineasSql,/CREATE UNIQUE INDEX programa_lineas_accion_unica_activa_idx/);
assert.match(lineasSql,/CREATE POLICY programa_lineas_accion_admin_insert/);
assert.match(lineasSql,/CREATE POLICY programa_lineas_accion_admin_update/);
assert.ok(!/DROP COLUMN (componentes_linea_accion|resultados_esperados)/i.test(lineasSql),'Textos legados de Programas intactos');
const filesBody=body('archivos');
const destinations=['id_organizacion','id_informacion_legal','id_programa','id_accion','id_donacion'];
for(const d of destinations) assert.ok(filesBody.includes(d+' uuid REFERENCES'),'FK anulable: '+d);
assert.match(filesBody,/num_nonnulls\(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion\) = 1/);
assert.ok(!filesBody.includes('entidad_tipo'));
const expedienteSql=sql.find(s=>s.includes('Expediente legal de Organizaciones'));
assert.ok(expedienteSql,'Existe migración del expediente legal');
assert.match(expedienteSql,/CREATE TABLE public\.documentos_informacion_legal/);
assert.match(body('informacion_legal'),/REFERENCES public\.organizaciones\(id_organizacion\)/);
assert.match(expedienteSql,/CREATE POLICY informacion_legal_lectura/);
assert.match(expedienteSql,/CREATE POLICY informacion_legal_insert/);
assert.match(expedienteSql,/CREATE POLICY informacion_legal_update/);
assert.match(expedienteSql,/CREATE OR REPLACE FUNCTION public\.guardar_expediente_legal/);
assert.match(expedienteSql,/SECURITY INVOKER/);
assert.match(expedienteSql,/application\/pdf/);
assert.match(expedienteSql,/10485760/);
const allowedSecurityDefiner=new Set([
 '20260909192500_fge_trigger_perfiles.sql',
 '20260916143000_fge_obtener_roles_usuario.sql',
 '20260922111500_fge_programas_storage_rls.sql',
 '20260923020339_fge_auditoria_escrituras_autorizadas.sql',
 '20260925120000_fge_guardar_programa_completo.sql',
 '20260928223251_fge_planes_actions_rls.sql',
 '20261002010000_fge_archivar_planes_acciones.sql',
 '20261002120000_fge_reforzar_rls_planes_acciones.sql',
 '20261002225137_fge_auditoria_planes_acciones.sql',
]);
for (let i=0;i<files.length;i++) {
 if (/SECURITY DEFINER/i.test(sql[i])) {
  assert.ok(allowedSecurityDefiner.has(files[i]),'SECURITY DEFINER permitido: '+files[i]);
 }
}
assert.ok(sql[2].includes("'fge-archivos',false"));
assert.ok(!sql[2].includes('INSERT INTO public.programas'));
assert.match(sql[3],/ADD COLUMN id_producto uuid REFERENCES public.productos/);
assert.match(sql[3],/num_nonnulls\(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion,id_producto\) = 1/);
const rpcSql=sql.find(s=>s.includes('get_organizaciones_mock'));
assert.ok(rpcSql,'Existe migración de la RPC de organizaciones');
assert.match(rpcSql,/SECURITY INVOKER/);
assert.match(rpcSql,/GRANT EXECUTE ON FUNCTION public\.get_organizaciones_mock\(text\) TO anon/);
const programasRlsSql=sql.find(s=>s.includes('programas_admin_insert'));
assert.ok(programasRlsSql,'Existe migración de RLS para Programas');
assert.match(programasRlsSql,/CREATE POLICY programas_lectura_roles/);
assert.match(programasRlsSql,/CREATE POLICY programas_admin_insert/);
assert.match(programasRlsSql,/CREATE POLICY storage_programas_admin_insert/);
assert.match(programasRlsSql,/file_size_limit = 614400/);
assert.match(programasRlsSql,/allowed_mime_types = ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
const accesoApiProgramasSql=sql.find(s=>s.includes('Restablece los privilegios de Data API'));
assert.ok(accesoApiProgramasSql,'Existe reparación de acceso Data API para Programas');
assert.match(accesoApiProgramasSql,/GRANT SELECT, INSERT, UPDATE\s+ON TABLE public\.programas\s+TO authenticated/);
assert.match(accesoApiProgramasSql,/GRANT SELECT, INSERT, UPDATE\s+ON TABLE public\.programa_lineas_accion\s+TO authenticated/);
assert.match(accesoApiProgramasSql,/GRANT EXECUTE\s+ON FUNCTION public\.guardar_programa_completo\(jsonb, uuid, bigint\)\s+TO authenticated/);
const sincronizacionProgramasSql=sql.find(s=>s.includes('Sincroniza una instancia que ya registró una versión anterior'));
assert.ok(sincronizacionProgramasSql,'Existe sincronización de la RPC remota de Programas');
assert.match(sincronizacionProgramasSql,/CREATE OR REPLACE FUNCTION public\.guardar_programa_completo/);
assert.match(sincronizacionProgramasSql,/'lineas_accion', 'referencias_ods', 'referencias_esg'/);
const planesRlsSql=sql.find(s=>s.includes('Acceso de las Astro Actions de Planes'));
assert.ok(planesRlsSql,'Existe migración de acceso para Astro Actions de Planes');
assert.match(planesRlsSql,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.planes TO authenticated/);
assert.match(planesRlsSql,/CREATE POLICY planes_lectura_roles/);
assert.match(planesRlsSql,/CREATE POLICY planes_gestion_insert/);
assert.match(planesRlsSql,/CREATE POLICY planes_gestion_update/);
assert.match(planesRlsSql,/usuario_puede_gestionar_organizacion/);
const auditoriaSql=sql.find(s=>s.includes('CREATE OR REPLACE FUNCTION fge_private.auditar_registro() RETURNS trigger'));
assert.ok(auditoriaSql,'Existe corrección del trigger de auditoría');
assert.match(auditoriaSql,/SECURITY DEFINER SET search_path = ''/);
assert.match(auditoriaSql,/REVOKE ALL ON FUNCTION fge_private\.auditar_registro\(\)/);
assert.match(config,/\[db\.seed\][\s\S]*?enabled\s*=\s*true/,'Seed habilitado');
assert.ok(!seed.includes('15800000-0000-4000-8000-000000000000'),'Seed sin organización ficticia');
const programasOficiales=[
 'Programa de Formalización',
 'Espacios con Valor',
 'Referentes al Frente',
 'Una vuelta +',
 'Voluntariado Corporativo — Una hora para salvar al mundo',
 'Donación de Recursos a Organizaciones Comunitarias',
];
for(const programa of programasOficiales) {
 assert.ok(seed.includes(`'${programa}'`),'Programa oficial en seed: '+programa);
}
assert.match(seed,/ON CONFLICT \(id_programa\) DO UPDATE SET/,'Seed de programas repetible');
const tests=readdirSync(join(root,'tests/database')).filter(f=>f.endsWith('.sql')).map(f=>readFileSync(join(root,'tests/database',f),'utf8')).join('\n');
assert.match(tests,/ROLLBACK;/);
assert.match(tests,/SET LOCAL ROLE anon;/);
assert.match(tests,/SET LOCAL ROLE authenticated;/);
const operacionesTest=readFileSync(join(root,'tests/database/005_operaciones_organizaciones.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.organizaciones','FROM public.organizaciones','UPDATE public.organizaciones']) {
 assert.ok(operacionesTest.includes(operacion),'Prueba de operación: '+operacion);
}
assert.match(operacionesTest,/JOIN public\.paises USING \(id_pais\)/,'Prueba relación Organización-País');
const lineasTest=readFileSync(join(root,'tests/database/007_programa_lineas_accion.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.programa_lineas_accion','FROM public.programa_lineas_accion','UPDATE public.programa_lineas_accion']) {
 assert.ok(lineasTest.includes(operacion),'Prueba de línea de acción: '+operacion);
}
for(const estadoSql of ['23503','23514']) {
 assert.ok(operacionesTest.includes(`'${estadoSql}'`),'Prueba restricción SQLSTATE '+estadoSql);
}
const repositorioOrganizaciones=readFileSync(join(root,'../backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts'),'utf8');
for(const operacion of ['list','getById','create','update']) {
 assert.match(repositorioOrganizaciones,new RegExp(`(?:async )?${operacion}\\(`),'Operación de Organizaciones: '+operacion);
}
for(const operacion of ['getLegalRecord','createLegalRecord','updateLegalRecord']) {
 assert.match(repositorioOrganizaciones,new RegExp(`(?:async )?${operacion}\\(`),'Operación de Expediente Legal: '+operacion);
}
const expedienteTest=readFileSync(join(root,'tests/database/011_expediente_legal.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.informacion_legal','FROM public.informacion_legal','UPDATE public.informacion_legal']) {
 assert.ok(expedienteTest.includes(operacion),'Prueba de Expediente Legal: '+operacion);
}

const diagnosticosTest=readFileSync(join(root,'tests/database/012_diagnosticos.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.diagnosticos','FROM public.diagnosticos','UPDATE public.diagnosticos']) {
 assert.ok(diagnosticosTest.includes(operacion),'Prueba de Diagnósticos: '+operacion);
}

assert.ok(!/service[_-]?role/i.test(repositorioOrganizaciones),'Repositorio sin clave privilegiada');
const repositorioProgramas=readFileSync(join(root,'../backend/services/programs/src/infrastructure/supabase-programs.repository.ts'),'utf8');
for(const operacion of ['list','getById','create','update']) {
 assert.match(repositorioProgramas,new RegExp(`(?:async )?${operacion}\\(`),'Operación de Programas: '+operacion);
}
assert.ok(!repositorioProgramas.includes('id_organizacion'),'Programas sin FK directa a Organización');
assert.ok(!/service[_-]?role/i.test(repositorioProgramas),'Operaciones de Programas sin clave privilegiada');
const operacionesProgramasTest=readFileSync(join(root,'tests/database/008_operaciones_programas.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.programas','FROM public.programas','UPDATE public.programas']) {
 assert.ok(operacionesProgramasTest.includes(operacion),'Prueba de Programa: '+operacion);
}
const repositorioPlanes=readFileSync(join(root,'../backend/services/interventions/src/infrastructure/supabase-interventions.repository.ts'),'utf8');
for(const operacion of ['list','getById','create','update']) {
 assert.match(repositorioPlanes,new RegExp(`(?:async )?${operacion}\\(`),'Operación de Planes: '+operacion);
}
assert.match(repositorioPlanes,/organizacion:organizaciones/,'Planes incluyen Organización');
assert.match(repositorioPlanes,/programa:programas/,'Planes incluyen Programa');
assert.ok(!/service[_-]?role/i.test(repositorioPlanes),'Operaciones de Planes sin clave privilegiada');
const operacionesPlanesTest=readFileSync(join(root,'tests/database/009_operaciones_planes.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.planes','FROM public.planes','UPDATE public.planes']) {
 assert.ok(operacionesPlanesTest.includes(operacion),'Prueba de Plan: '+operacion);
}
const accionesRlsSql=sql.find(s=>s.includes('Astro Actions de Acciones asociadas a Planes'));
assert.ok(accionesRlsSql,'Existe migración de acceso para Astro Actions de Acciones');
assert.match(accionesRlsSql,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.acciones TO authenticated/);
assert.match(accionesRlsSql,/CREATE POLICY acciones_lectura_roles/);
assert.match(accionesRlsSql,/CREATE POLICY acciones_gestion_insert/);
assert.match(accionesRlsSql,/CREATE POLICY acciones_gestion_update/);
assert.match(accionesRlsSql,/usuario_puede_gestionar_organizacion/);
const refuerzoRlsSql=sql.find(s=>s.includes('Refuerza RLS de Planes y Acciones'));
assert.ok(refuerzoRlsSql,'Existe refuerzo RLS territorial para Planes y Acciones');
assert.match(refuerzoRlsSql,/usuario_tiene_cobertura_pais/);
assert.match(refuerzoRlsSql,/usuario_puede_consultar_organizacion/);
assert.match(refuerzoRlsSql,/permisos_temporales/);
assert.match(refuerzoRlsSql,/DROP POLICY IF EXISTS planes_lectura_roles/);
assert.match(refuerzoRlsSql,/DROP POLICY IF EXISTS acciones_lectura_roles/);
const repositorioAcciones=repositorioPlanes;
for(const operacion of ['list','getById','create','update']) {
 assert.match(repositorioAcciones,new RegExp(`(?:async )?${operacion}\\(`),'Operación de Acciones: '+operacion);
}
assert.match(repositorioAcciones,/plan:planes/,'Acciones incluyen el Plan asociado');
assert.ok(!/service[_-]?role/i.test(repositorioAcciones),'Operaciones de Acciones sin clave privilegiada');
const operacionesAccionesTest=readFileSync(join(root,'tests/database/010_operaciones_acciones.test.sql'),'utf8');
for(const operacion of ['INSERT INTO public.acciones','FROM public.acciones','UPDATE public.acciones']) {
 assert.ok(operacionesAccionesTest.includes(operacion),'Prueba de Acción: '+operacion);
}
const assertions=(tests.match(/SELECT (?:has_table|has_column|hasnt_column|hasnt_table|fk_ok|throws_ok|lives_ok|is|ok)\(/g)||[]).length;
console.log(JSON.stringify({migraciones:files.length,tablas_public:tables.length,tablas_auditoria:1,programas_institucionales_seed:programasOficiales.length,operaciones_organizaciones:4,operaciones_programas:4,operaciones_planes:4,operaciones_acciones:4,aserciones_pgtap_preparadas:assertions,revision_estatica:'correcta',nota:'Este script no ejecuta PostgreSQL; usar supabase test db --local'},null,2));

// SCRUM-84/87: contratos nuevos y acceso mínimo de las relaciones.
assert.match(allSql,/periodo_anual BETWEEN 1 AND 9999/);
assert.match(allSql,/ALTER COLUMN periodo_anual SET NOT NULL/);
assert.match(allSql,/GRANT SELECT \(id_organizacion, id_pais, nombre, archived_at\) ON public\.organizaciones/);
assert.match(allSql,/CREATE POLICY organizaciones_lectura_planes/);
assert.match(allSql,/ADD COLUMN descripcion text/);
assert.match(allSql,/CREATE FUNCTION fge_private\.auditar_plan_accion\(\)/);
assert.match(allSql,/REVOKE ALL ON FUNCTION fge_private\.auditar_plan_accion\(\) FROM PUBLIC, anon, authenticated/);
