BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve)
SELECT '13000000-0000-4000-8000-000000000001',id_pais,'SCRUM130 prueba','Representante','123','Comunidad','Prueba'
FROM public.paises WHERE codigo_iso = 'CL';
INSERT INTO public.programas(id_programa,nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados)
VALUES ('13000000-0000-4000-8000-000000000002','SCRUM130 programa','Prueba','Prueba','Prueba','Prueba','Prueba');

PREPARE crear_aporte(text,text,text,numeric,text,text) AS
INSERT INTO public.donaciones(id_organizacion,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,categoria,categoria_otro,estado,tipo_donante,origen,valor_estimado,moneda_valorizacion,metodo_valorizacion,id_programa)
VALUES ('13000000-0000-4000-8000-000000000001','2026-10-20','recibida','Donante ficticio','Aporte de prueba','recurso',$1,$2,$3,'empresa','Campaña',$4,$5,$6,'13000000-0000-4000-8000-000000000002');

SELECT lives_ok($$EXECUTE crear_aporte('Servicio',NULL,'Comprometida',100,'CLP','Cotización')$$,'Servicio sin cantidad admite valorización');
SELECT lives_ok($$EXECUTE crear_aporte('Producto',NULL,'Recibida',NULL,NULL,NULL)$$,'Producto y Recibida válidos');
SELECT lives_ok($$EXECUTE crear_aporte('Insumos',NULL,'Entregada',NULL,NULL,NULL)$$,'Insumos y Entregada válidos');
SELECT lives_ok($$EXECUTE crear_aporte('Otro','Descripción adicional','Cerrada',0,'USD','Valor declarado')$$,'Otro con descripción y valorización cero válidos');
SELECT throws_ok($$EXECUTE crear_aporte('Alimentos',NULL,'Recibida',NULL,NULL,NULL)$$,'23514',NULL,'No admite categoría fuera de HU20');
SELECT throws_ok($$EXECUTE crear_aporte('Otro',NULL,'Recibida',NULL,NULL,NULL)$$,'23514',NULL,'Otro requiere descripción');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio','Otra', 'Recibida',NULL,NULL,NULL)$$,'23514',NULL,'Descripción Otro exclusiva');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Pendiente',NULL,NULL,NULL)$$,'23514',NULL,'No admite estados adicionales');
SELECT throws_ok($$EXECUTE crear_aporte('Dinero',NULL,'Recibida',NULL,NULL,NULL)$$,'23514',NULL,'Categoría Dinero exige tipo dinero');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida',10,NULL,NULL)$$,'23514',NULL,'Valorización requiere moneda y método');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida',-1,'CLP','Prueba')$$,'23514',NULL,'Valorización negativa rechazada');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida','NaN','CLP','Prueba')$$,'23514',NULL,'NaN rechazado');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida','Infinity','CLP','Prueba')$$,'23514',NULL,'Infinito rechazado');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida',1,'clp','Prueba')$$,'23514',NULL,'Moneda exige tres mayúsculas');
SELECT throws_ok($$EXECUTE crear_aporte('Servicio',NULL,'Recibida',1,'CLP',' ')$$,'23514',NULL,'Método vacío rechazado');

SELECT is((SELECT count(*) FROM public.donaciones WHERE id_organizacion='13000000-0000-4000-8000-000000000001'),4::bigint,'Consulta devuelve los cuatro registros');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.donaciones d JOIN public.organizaciones o USING(id_organizacion) WHERE d.id_pais <> o.id_pais),'País coincide con Organización');
SELECT throws_ok($$UPDATE public.donaciones SET id_pais=(SELECT id_pais FROM public.paises WHERE codigo_iso='UY') WHERE id_organizacion='13000000-0000-4000-8000-000000000001'$$,'23503',NULL,'No permite país de otra Organización');
SELECT throws_ok($$UPDATE public.donaciones SET id_programa='ffffffff-ffff-4fff-8fff-ffffffffffff' WHERE id_organizacion='13000000-0000-4000-8000-000000000001'$$,'23503',NULL,'Programa inexistente rechazado');
SELECT throws_ok($$UPDATE public.donaciones SET tipo_donante='otro' WHERE id_organizacion='13000000-0000-4000-8000-000000000001'$$,'23514',NULL,'Tipo de donante fuera de HU20 rechazado');
SELECT throws_ok($$UPDATE public.donaciones SET cantidad=1 WHERE id_organizacion='13000000-0000-4000-8000-000000000001'$$,'23514',NULL,'Cantidad requiere unidad');
SELECT lives_ok($$UPDATE public.donaciones SET cantidad=2,unidad='horas' WHERE id_organizacion='13000000-0000-4000-8000-000000000001' AND categoria='Servicio'$$,'Cantidad y unidad se conservan junto a valorización');
SELECT is((SELECT version FROM public.donaciones WHERE id_organizacion='13000000-0000-4000-8000-000000000001' AND categoria='Servicio'),2::bigint,'Reutiliza versión institucional');
SELECT ok(EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE tabla_afectada='donaciones' AND despues->>'categoria'='Servicio' AND despues->>'origen'='Campaña'),'Auditoría incluye metadatos nuevos');
SELECT ok(NOT has_table_privilege('authenticated','public.donaciones','DELETE'),'Sin eliminación física por clientes');
SELECT fk_ok('public','archivos','id_donacion','public','donaciones','id_donacion','Respaldos reutilizan archivos');
SELECT lives_ok($$UPDATE public.donaciones SET archived_at=clock_timestamp() WHERE id_organizacion='13000000-0000-4000-8000-000000000001'$$,'Archivado conserva filas');
SELECT is((SELECT count(*) FROM public.donaciones WHERE id_organizacion='13000000-0000-4000-8000-000000000001' AND archived_at IS NOT NULL),4::bigint,'Se conserva trazabilidad de registros archivados');
DEALLOCATE crear_aporte;
SELECT * FROM finish();
ROLLBACK;
