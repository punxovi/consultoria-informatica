-- Ejecutar solamente en Supabase LOCAL de pruebas. Todo se revierte.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public','programas','Existe programas');
SELECT hasnt_column('public','planes','id_organizacion','Plan obtiene organización por programa');
SELECT hasnt_table('public','organizacion_programas','Sin asociación N:M');
SELECT fk_ok('public','programas','id_organizacion','public','organizaciones','id_organizacion','Programa pertenece a una organización');
SELECT fk_ok('public','perfiles','id_usuario','auth','users','id','Perfil usa identidad Auth');
SELECT throws_ok($q$INSERT INTO public.perfiles(id_usuario,nombre) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','No existe')$q$,'23503',NULL,'No se admite perfil sin Auth');

INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
SELECT '10000000-0000-0000-0000-000000000001',id_pais,'Organización prueba','Representante','123','prueba@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','comedor_merendero',10 FROM public.paises WHERE codigo_iso='CL';
INSERT INTO public.programas(id_programa,id_organizacion,nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados)
VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Programa propio','Prueba','Prueba','Prueba','Prueba','Prueba');
INSERT INTO public.planes(id_plan,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino)
VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Plan','Necesidad','Objetivo','Objetivos','Resultado','Persona','2026-09-01','2026-10-01');
INSERT INTO public.acciones(id_accion,id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Acción','Persona','2026-09-01','2026-09-10');

SELECT throws_ok($q$UPDATE public.planes SET fecha_termino='2026-08-01' WHERE id_plan='30000000-0000-0000-0000-000000000001'$q$,'23514',NULL,'Fechas ordenadas');
SELECT throws_ok($q$UPDATE public.acciones SET estado='cancelada' WHERE id_accion='40000000-0000-0000-0000-000000000001'$q$,'23514',NULL,'Cancelación exige motivo');
SELECT lives_ok($q$UPDATE public.acciones SET estado='cancelada',observacion_motivo='Sin recursos' WHERE id_accion='40000000-0000-0000-0000-000000000001'$q$,'Cancelación explicada aceptada');
SELECT is((SELECT version FROM public.acciones WHERE id_accion='40000000-0000-0000-0000-000000000001'),2::bigint,'Versión se incrementa');

SELECT throws_ok($q$INSERT INTO public.archivos(ruta_objeto,nombre_original,mime_type,categoria) VALUES ('prueba/sin-destino','a.pdf','application/pdf','acta_pdf')$q$,'23514',NULL,'Archivo necesita destino');
SELECT throws_ok($q$INSERT INTO public.archivos(id_organizacion,id_accion,ruta_objeto,nombre_original,mime_type,categoria) VALUES ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','prueba/dos','a.pdf','application/pdf','acta_pdf')$q$,'23514',NULL,'Archivo rechaza dos destinos');
SELECT throws_ok($q$INSERT INTO public.archivos(id_accion,ruta_objeto,nombre_original,mime_type,categoria) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','prueba/huerfano','a.pdf','application/pdf','acta_pdf')$q$,'23503',NULL,'Destino debe existir');
SELECT lives_ok($q$INSERT INTO public.archivos(id_accion,ruta_objeto,nombre_original,mime_type,categoria) VALUES ('40000000-0000-0000-0000-000000000001','prueba/valido','a.pdf','application/pdf','acta_pdf')$q$,'Un destino válido aceptado');
SELECT throws_ok($q$UPDATE public.archivos SET estado_carga='disponible' WHERE ruta_objeto='prueba/valido'$q$,'23514',NULL,'Disponible exige tamaño');
SELECT throws_ok($q$DELETE FROM public.acciones WHERE id_accion='40000000-0000-0000-0000-000000000001'$q$,'23503',NULL,'No borrar acción con archivo');

SELECT throws_ok($q$INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,monto) VALUES ('10000000-0000-0000-0000-000000000001','2026-09-01','recibida','Empresa','Aporte','dinero',100)$q$,'23514',NULL,'Dinero exige moneda');
SELECT lives_ok($q$INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,cantidad,unidad) VALUES ('10000000-0000-0000-0000-000000000001','2026-09-01','recibida','Empresa','Alimentos','recurso',5,'cajas')$q$,'Registro mínimo de recursos aceptado');
SELECT throws_ok($q$INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,cantidad,unidad) VALUES ('10000000-0000-0000-0000-000000000001','2026-09-01','recibida','Empresa','Alimentos','recurso',-1,'cajas')$q$,'23514',NULL,'Cantidad negativa rechazada');

INSERT INTO public.informacion_legal(id_organizacion,estado_personalidad_juridica)
VALUES ('10000000-0000-0000-0000-000000000001','en_proceso');
SELECT throws_ok($q$INSERT INTO public.informacion_legal(id_organizacion,estado_personalidad_juridica) VALUES ('10000000-0000-0000-0000-000000000001','si')$q$,'23505',NULL,'Solo una ficha legal actual');
SELECT ok(EXISTS(SELECT FROM fge_private.historial_cambios WHERE tabla_afectada='acciones' AND tipo_accion='UPDATE' AND antes->>'estado'='no_iniciada' AND despues->>'estado'='cancelada'),'Auditoría contiene antes y después');
SELECT throws_ok($q$DELETE FROM fge_private.historial_cambios$q$,'42501',NULL,'Historial no admite borrado');

-- Comprobar cierre de TODAS las tablas de esta entrega, no solo una.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.paises'::regclass),'RLS habilitada: paises');
SELECT ok(NOT has_table_privilege('anon','public.paises','SELECT') AND NOT has_table_privilege('authenticated','public.paises','SELECT'),'Sin lectura cliente: paises');
SELECT ok(NOT has_table_privilege('authenticated','public.paises','INSERT') AND NOT has_table_privilege('authenticated','public.paises','UPDATE') AND NOT has_table_privilege('authenticated','public.paises','DELETE'),'Sin escritura cliente: paises');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.perfiles'::regclass),'RLS habilitada: perfiles');
SELECT ok(NOT has_table_privilege('anon','public.perfiles','SELECT') AND NOT has_table_privilege('authenticated','public.perfiles','SELECT'),'Sin lectura cliente: perfiles');
SELECT ok(NOT has_table_privilege('authenticated','public.perfiles','INSERT') AND NOT has_table_privilege('authenticated','public.perfiles','UPDATE') AND NOT has_table_privilege('authenticated','public.perfiles','DELETE'),'Sin escritura cliente: perfiles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.roles'::regclass),'RLS habilitada: roles');
SELECT ok(NOT has_table_privilege('anon','public.roles','SELECT') AND NOT has_table_privilege('authenticated','public.roles','SELECT'),'Sin lectura cliente: roles');
SELECT ok(NOT has_table_privilege('authenticated','public.roles','INSERT') AND NOT has_table_privilege('authenticated','public.roles','UPDATE') AND NOT has_table_privilege('authenticated','public.roles','DELETE'),'Sin escritura cliente: roles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.permisos'::regclass),'RLS habilitada: permisos');
SELECT ok(NOT has_table_privilege('anon','public.permisos','SELECT') AND NOT has_table_privilege('authenticated','public.permisos','SELECT'),'Sin lectura cliente: permisos');
SELECT ok(NOT has_table_privilege('authenticated','public.permisos','INSERT') AND NOT has_table_privilege('authenticated','public.permisos','UPDATE') AND NOT has_table_privilege('authenticated','public.permisos','DELETE'),'Sin escritura cliente: permisos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.roles_permisos'::regclass),'RLS habilitada: roles_permisos');
SELECT ok(NOT has_table_privilege('anon','public.roles_permisos','SELECT') AND NOT has_table_privilege('authenticated','public.roles_permisos','SELECT'),'Sin lectura cliente: roles_permisos');
SELECT ok(NOT has_table_privilege('authenticated','public.roles_permisos','INSERT') AND NOT has_table_privilege('authenticated','public.roles_permisos','UPDATE') AND NOT has_table_privilege('authenticated','public.roles_permisos','DELETE'),'Sin escritura cliente: roles_permisos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.asignaciones_roles'::regclass),'RLS habilitada: asignaciones_roles');
SELECT ok(NOT has_table_privilege('anon','public.asignaciones_roles','SELECT') AND NOT has_table_privilege('authenticated','public.asignaciones_roles','SELECT'),'Sin lectura cliente: asignaciones_roles');
SELECT ok(NOT has_table_privilege('authenticated','public.asignaciones_roles','INSERT') AND NOT has_table_privilege('authenticated','public.asignaciones_roles','UPDATE') AND NOT has_table_privilege('authenticated','public.asignaciones_roles','DELETE'),'Sin escritura cliente: asignaciones_roles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.permisos_temporales'::regclass),'RLS habilitada: permisos_temporales');
SELECT ok(NOT has_table_privilege('anon','public.permisos_temporales','SELECT') AND NOT has_table_privilege('authenticated','public.permisos_temporales','SELECT'),'Sin lectura cliente: permisos_temporales');
SELECT ok(NOT has_table_privilege('authenticated','public.permisos_temporales','INSERT') AND NOT has_table_privilege('authenticated','public.permisos_temporales','UPDATE') AND NOT has_table_privilege('authenticated','public.permisos_temporales','DELETE'),'Sin escritura cliente: permisos_temporales');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.permiso_temporal_detalles'::regclass),'RLS habilitada: permiso_temporal_detalles');
SELECT ok(NOT has_table_privilege('anon','public.permiso_temporal_detalles','SELECT') AND NOT has_table_privilege('authenticated','public.permiso_temporal_detalles','SELECT'),'Sin lectura cliente: permiso_temporal_detalles');
SELECT ok(NOT has_table_privilege('authenticated','public.permiso_temporal_detalles','INSERT') AND NOT has_table_privilege('authenticated','public.permiso_temporal_detalles','UPDATE') AND NOT has_table_privilege('authenticated','public.permiso_temporal_detalles','DELETE'),'Sin escritura cliente: permiso_temporal_detalles');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.organizaciones'::regclass),'RLS habilitada: organizaciones');
SELECT ok(NOT has_table_privilege('anon','public.organizaciones','SELECT') AND NOT has_table_privilege('authenticated','public.organizaciones','SELECT'),'Sin lectura cliente: organizaciones');
SELECT ok(NOT has_table_privilege('authenticated','public.organizaciones','INSERT') AND NOT has_table_privilege('authenticated','public.organizaciones','UPDATE') AND NOT has_table_privilege('authenticated','public.organizaciones','DELETE'),'Sin escritura cliente: organizaciones');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.organizacion_redes'::regclass),'RLS habilitada: organizacion_redes');
SELECT ok(NOT has_table_privilege('anon','public.organizacion_redes','SELECT') AND NOT has_table_privilege('authenticated','public.organizacion_redes','SELECT'),'Sin lectura cliente: organizacion_redes');
SELECT ok(NOT has_table_privilege('authenticated','public.organizacion_redes','INSERT') AND NOT has_table_privilege('authenticated','public.organizacion_redes','UPDATE') AND NOT has_table_privilege('authenticated','public.organizacion_redes','DELETE'),'Sin escritura cliente: organizacion_redes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.contactos'::regclass),'RLS habilitada: contactos');
SELECT ok(NOT has_table_privilege('anon','public.contactos','SELECT') AND NOT has_table_privilege('authenticated','public.contactos','SELECT'),'Sin lectura cliente: contactos');
SELECT ok(NOT has_table_privilege('authenticated','public.contactos','INSERT') AND NOT has_table_privilege('authenticated','public.contactos','UPDATE') AND NOT has_table_privilege('authenticated','public.contactos','DELETE'),'Sin escritura cliente: contactos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.informacion_legal'::regclass),'RLS habilitada: informacion_legal');
SELECT ok(NOT has_table_privilege('anon','public.informacion_legal','SELECT') AND NOT has_table_privilege('authenticated','public.informacion_legal','SELECT'),'Sin lectura cliente: informacion_legal');
SELECT ok(NOT has_table_privilege('authenticated','public.informacion_legal','INSERT') AND NOT has_table_privilege('authenticated','public.informacion_legal','UPDATE') AND NOT has_table_privilege('authenticated','public.informacion_legal','DELETE'),'Sin escritura cliente: informacion_legal');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.diagnosticos'::regclass),'RLS habilitada: diagnosticos');
SELECT ok(NOT has_table_privilege('anon','public.diagnosticos','SELECT') AND NOT has_table_privilege('authenticated','public.diagnosticos','SELECT'),'Sin lectura cliente: diagnosticos');
SELECT ok(NOT has_table_privilege('authenticated','public.diagnosticos','INSERT') AND NOT has_table_privilege('authenticated','public.diagnosticos','UPDATE') AND NOT has_table_privilege('authenticated','public.diagnosticos','DELETE'),'Sin escritura cliente: diagnosticos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.programas'::regclass),'RLS habilitada: programas');
SELECT ok(NOT has_table_privilege('anon','public.programas','SELECT') AND has_table_privilege('authenticated','public.programas','SELECT'),'Lectura cliente autenticada controlada por RLS: programas');
SELECT ok(has_table_privilege('authenticated','public.programas','INSERT') AND has_table_privilege('authenticated','public.programas','UPDATE') AND NOT has_table_privilege('authenticated','public.programas','DELETE'),'Escritura autenticada controlada por RLS: programas');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.planes'::regclass),'RLS habilitada: planes');
SELECT ok(NOT has_table_privilege('anon','public.planes','SELECT') AND NOT has_table_privilege('authenticated','public.planes','SELECT'),'Sin lectura cliente: planes');
SELECT ok(NOT has_table_privilege('authenticated','public.planes','INSERT') AND NOT has_table_privilege('authenticated','public.planes','UPDATE') AND NOT has_table_privilege('authenticated','public.planes','DELETE'),'Sin escritura cliente: planes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.acciones'::regclass),'RLS habilitada: acciones');
SELECT ok(NOT has_table_privilege('anon','public.acciones','SELECT') AND NOT has_table_privilege('authenticated','public.acciones','SELECT'),'Sin lectura cliente: acciones');
SELECT ok(NOT has_table_privilege('authenticated','public.acciones','INSERT') AND NOT has_table_privilege('authenticated','public.acciones','UPDATE') AND NOT has_table_privilege('authenticated','public.acciones','DELETE'),'Sin escritura cliente: acciones');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.actas'::regclass),'RLS habilitada: actas');
SELECT ok(NOT has_table_privilege('anon','public.actas','SELECT') AND NOT has_table_privilege('authenticated','public.actas','SELECT'),'Sin lectura cliente: actas');
SELECT ok(NOT has_table_privilege('authenticated','public.actas','INSERT') AND NOT has_table_privilege('authenticated','public.actas','UPDATE') AND NOT has_table_privilege('authenticated','public.actas','DELETE'),'Sin escritura cliente: actas');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.acta_participantes'::regclass),'RLS habilitada: acta_participantes');
SELECT ok(NOT has_table_privilege('anon','public.acta_participantes','SELECT') AND NOT has_table_privilege('authenticated','public.acta_participantes','SELECT'),'Sin lectura cliente: acta_participantes');
SELECT ok(NOT has_table_privilege('authenticated','public.acta_participantes','INSERT') AND NOT has_table_privilege('authenticated','public.acta_participantes','UPDATE') AND NOT has_table_privilege('authenticated','public.acta_participantes','DELETE'),'Sin escritura cliente: acta_participantes');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.compromisos'::regclass),'RLS habilitada: compromisos');
SELECT ok(NOT has_table_privilege('anon','public.compromisos','SELECT') AND NOT has_table_privilege('authenticated','public.compromisos','SELECT'),'Sin lectura cliente: compromisos');
SELECT ok(NOT has_table_privilege('authenticated','public.compromisos','INSERT') AND NOT has_table_privilege('authenticated','public.compromisos','UPDATE') AND NOT has_table_privilege('authenticated','public.compromisos','DELETE'),'Sin escritura cliente: compromisos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.indicadores'::regclass),'RLS habilitada: indicadores');
SELECT ok(NOT has_table_privilege('anon','public.indicadores','SELECT') AND NOT has_table_privilege('authenticated','public.indicadores','SELECT'),'Sin lectura cliente: indicadores');
SELECT ok(NOT has_table_privilege('authenticated','public.indicadores','INSERT') AND NOT has_table_privilege('authenticated','public.indicadores','UPDATE') AND NOT has_table_privilege('authenticated','public.indicadores','DELETE'),'Sin escritura cliente: indicadores');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.resultados'::regclass),'RLS habilitada: resultados');
SELECT ok(NOT has_table_privilege('anon','public.resultados','SELECT') AND NOT has_table_privilege('authenticated','public.resultados','SELECT'),'Sin lectura cliente: resultados');
SELECT ok(NOT has_table_privilege('authenticated','public.resultados','INSERT') AND NOT has_table_privilege('authenticated','public.resultados','UPDATE') AND NOT has_table_privilege('authenticated','public.resultados','DELETE'),'Sin escritura cliente: resultados');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.donaciones'::regclass),'RLS habilitada: donaciones');
SELECT ok(NOT has_table_privilege('anon','public.donaciones','SELECT') AND NOT has_table_privilege('authenticated','public.donaciones','SELECT'),'Sin lectura cliente: donaciones');
SELECT ok(NOT has_table_privilege('authenticated','public.donaciones','INSERT') AND NOT has_table_privilege('authenticated','public.donaciones','UPDATE') AND NOT has_table_privilege('authenticated','public.donaciones','DELETE'),'Sin escritura cliente: donaciones');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.archivos'::regclass),'RLS habilitada: archivos');
SELECT ok(NOT has_table_privilege('anon','public.archivos','SELECT') AND has_table_privilege('authenticated','public.archivos','SELECT'),'Lectura cliente autenticada controlada por RLS: archivos');
SELECT ok(has_table_privilege('authenticated','public.archivos','INSERT') AND has_table_privilege('authenticated','public.archivos','UPDATE') AND NOT has_table_privilege('authenticated','public.archivos','DELETE'),'Escritura autenticada controlada por RLS: archivos');
SELECT is((SELECT public FROM storage.buckets WHERE id='fge-archivos'),false,'Bucket privado');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='organizaciones'),0::bigint,'No se inventan políticas de roles');
SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT * FROM public.organizaciones$q$,'42501',NULL,'Anon no accede');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT * FROM public.organizaciones$q$,'42501',NULL,'Authenticated no accede todavía');
SELECT throws_ok($q$INSERT INTO public.roles(codigo,nombre) VALUES ('intruso','Intruso')$q$,'42501',NULL,'No se puede crear un rol desde cliente');
RESET ROLE;

-- Aun con GRANT accidental, RLS sin políticas mantiene lectura vacía.
GRANT SELECT ON public.organizaciones TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.organizaciones),0::bigint,'RLS deniega filas aunque exista SELECT');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
