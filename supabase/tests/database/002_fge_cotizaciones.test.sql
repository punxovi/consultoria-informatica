-- Solo Supabase local. Datos de prueba revertidos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();
INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
SELECT ('11000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,id_pais,'Org ' || n,'Representante','123','prueba@example.invalid','Región','Ciudad','Dirección','Comunidad','Prueba','comedor_merendero',10
FROM public.paises CROSS JOIN generate_series(1,2) n WHERE codigo_iso='CL';
INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,publicado)
VALUES
 ('12000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Bolso','Hecho a mano','unidad',true),
 ('12000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002','Pan','Artesanal','kg',true),
 ('12000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000002','Borrador','Sin publicar','unidad',false);
INSERT INTO public.solicitudes_cotizacion(id_solicitud,nombre_solicitante,correo)
VALUES ('13000000-0000-0000-0000-000000000001','Visitante','persona@example.invalid');
SELECT lives_ok($q$INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud,id_producto,cantidad)
VALUES ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',2),
('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002',1.5)$q$,'Una solicitud incluye productos de distintas organizaciones');
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE','Solicitud completa cumple restricción diferida');
SET CONSTRAINTS ALL DEFERRED;
SELECT is((SELECT nombre_producto FROM public.solicitud_cotizacion_detalles WHERE id_producto='12000000-0000-0000-0000-000000000001'),'Bolso','Nombre copiado desde catálogo');
UPDATE public.productos SET nombre='Bolso nuevo',unidad_medida='caja' WHERE id_producto='12000000-0000-0000-0000-000000000001';
SELECT is((SELECT nombre_producto || '/' || unidad_medida FROM public.solicitud_cotizacion_detalles WHERE id_producto='12000000-0000-0000-0000-000000000001'),'Bolso/unidad','Cambios de catálogo no alteran solicitud anterior');
UPDATE public.solicitud_cotizacion_detalles SET nombre_producto='Manipulado',unidad_medida='otra' WHERE id_producto='12000000-0000-0000-0000-000000000001';
SELECT is((SELECT nombre_producto || '/' || unidad_medida FROM public.solicitud_cotizacion_detalles WHERE id_producto='12000000-0000-0000-0000-000000000001'),'Bolso/unidad','Copia histórica no se sobrescribe');
SELECT throws_ok($q$UPDATE public.productos SET id_organizacion='11000000-0000-0000-0000-000000000002' WHERE id_producto='12000000-0000-0000-0000-000000000001'$q$,'23514',NULL,'No reasignar producto ya cotizado');
SELECT throws_ok($q$INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud,id_producto,cantidad) VALUES ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003',1)$q$,'23514',NULL,'Producto sin publicar rechazado');
SELECT throws_ok($q$INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud,id_producto,cantidad) VALUES ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',1)$q$,'23505',NULL,'Producto duplicado rechazado');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET id_producto='12000000-0000-0000-0000-000000000003'$q$,'23514',NULL,'No cambiar referencia histórica');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET cantidad=0$q$,'23514',NULL,'Cantidad inválida: 0');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET cantidad=-1$q$,'23514',NULL,'Cantidad inválida: -1');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET cantidad='NaN'$q$,'23514',NULL,'Cantidad inválida: NaN');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET cantidad='Infinity'$q$,'23514',NULL,'Cantidad inválida: Infinity');
SELECT throws_ok($q$INSERT INTO public.solicitudes_cotizacion(nombre_solicitante,correo) VALUES ('Persona','invalido')$q$,'23514',NULL,'Correo inválido rechazado');
SELECT throws_ok($q$UPDATE public.solicitudes_cotizacion SET estado='pagada'$q$,'23514',NULL,'Sin estado de pago');
SELECT throws_ok($q$INSERT INTO public.solicitudes_cotizacion(nombre_solicitante,correo) VALUES ('Vacía','v@example.invalid'); SET CONSTRAINTS ALL IMMEDIATE$q$,'23514',NULL,'No confirmar solicitud sin productos');
SELECT throws_ok($q$DELETE FROM public.solicitud_cotizacion_detalles; SET CONSTRAINTS ALL IMMEDIATE$q$,'23514',NULL,'No eliminar todos los productos');
SELECT throws_ok($q$UPDATE public.solicitud_cotizacion_detalles SET archived_at=now(); SET CONSTRAINTS ALL IMMEDIATE$q$,'23514',NULL,'No archivar todos los productos');
SELECT lives_ok($q$INSERT INTO public.archivos(id_producto,ruta_objeto,nombre_original,mime_type,categoria,estado_carga,tamano_bytes) VALUES ('12000000-0000-0000-0000-000000000001','productos/bolso.png','bolso.png','image/png','imagen_producto','disponible',100)$q$,'Imagen usa archivos existente');
SELECT throws_ok($q$UPDATE public.archivos SET id_organizacion='11000000-0000-0000-0000-000000000001' WHERE ruta_objeto='productos/bolso.png'$q$,'23514',NULL,'Imagen rechaza dos destinos');
SELECT throws_ok($q$UPDATE public.archivos SET mime_type='application/pdf' WHERE ruta_objeto='productos/bolso.png'$q$,'23514',NULL,'Imagen no admite PDF');
SELECT throws_ok($q$UPDATE public.archivos SET categoria='acta_pdf' WHERE ruta_objeto='productos/bolso.png'$q$,'23514',NULL,'Categoría debe corresponder al producto');
SELECT ok(EXISTS(SELECT FROM fge_private.historial_cambios WHERE tabla_afectada='solicitudes_cotizacion' AND tipo_accion='INSERT'),'Solicitud deja auditoría');
SELECT ok(NOT (SELECT public FROM storage.buckets WHERE id='fge-archivos'),'Bucket documental permanece privado');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.productos'::regclass),'RLS productos');
SELECT ok(NOT has_table_privilege('anon','public.productos','SELECT') AND NOT has_table_privilege('authenticated','public.productos','SELECT'),'Datos cerrados hasta integración: productos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.solicitudes_cotizacion'::regclass),'RLS solicitudes_cotizacion');
SELECT ok(NOT has_table_privilege('anon','public.solicitudes_cotizacion','SELECT') AND NOT has_table_privilege('authenticated','public.solicitudes_cotizacion','SELECT'),'Datos cerrados hasta integración: solicitudes_cotizacion');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.solicitud_cotizacion_detalles'::regclass),'RLS solicitud_cotizacion_detalles');
SELECT ok(NOT has_table_privilege('anon','public.solicitud_cotizacion_detalles','SELECT') AND NOT has_table_privilege('authenticated','public.solicitud_cotizacion_detalles','SELECT'),'Datos cerrados hasta integración: solicitud_cotizacion_detalles');
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.solicitudes_cotizacion','42501',NULL,'Visitante no puede leer datos personales');
SELECT throws_ok($q$INSERT INTO public.solicitudes_cotizacion(nombre_solicitante,correo) VALUES ('P','p@example.invalid')$q$,'42501',NULL,'Sin escritura anónima directa');
RESET ROLE;
SELECT lives_ok('SET CONSTRAINTS ALL IMMEDIATE','Estado final de prueba consistente');
SELECT * FROM finish();
ROLLBACK;
