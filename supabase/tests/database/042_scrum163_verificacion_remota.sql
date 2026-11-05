-- Ejecutar después de 20261105120000_fge_scrum163_solicitudes_cotizacion.sql.
-- Datos sintéticos y avisos de prueba se revierten. No envía correos.
BEGIN;
CREATE TEMP TABLE scrum163_verificacion(resultado jsonb) ON COMMIT DROP;
DO $$
DECLARE pais uuid;org uuid;producto uuid;items jsonb:='[]';envio jsonb;fila jsonb;admin_id uuid;numero integer:=0;antes bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  FOR pais IN SELECT p.id_pais FROM public.paises p WHERE p.archived_at IS NULL
    AND (SELECT count(*) FROM fge_private.coordinadores_cotizacion() c WHERE c.id_pais=p.id_pais)<=1 ORDER BY p.id_pais LIMIT 2 LOOP
    org:=gen_random_uuid();producto:=gen_random_uuid();numero:=numero+1;
    INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
    VALUES(org,pais,'QA SCRUM-163 '||org,'Persona sintética QA','123','qa@example.invalid','Región QA','Ciudad QA','Dirección QA','Prueba','Registro transaccional de prueba','comedor_merendero',1);
    INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,publicado)
    VALUES(producto,org,'Producto QA SCRUM-163','Registro sintético que se revierte','unidad',true);
    items:=items||jsonb_build_array(jsonb_build_object('id_producto',producto,'cantidad',2.5));
  END LOOP;
  IF numero<2 THEN RAISE EXCEPTION 'La prueba requiere dos países activos sin asignaciones ambiguas de Coordinador'; END IF;
  envio:=public.registrar_solicitud_cotizacion(jsonb_build_object('nombre','Persona QA','apellido','Prueba','correo','qa@example.invalid','mensaje','Antecedentes sintéticos','items',items));
  IF jsonb_array_length(envio->'solicitudes')<>numero OR (SELECT count(*) FROM public.solicitudes_cotizacion WHERE id_envio=(envio->>'id_envio')::uuid)<>numero THEN
    RAISE EXCEPTION 'No se generó una solicitud por país'; END IF;
  IF EXISTS(SELECT 1 FROM public.solicitudes_cotizacion s WHERE s.id_envio=(envio->>'id_envio')::uuid AND
    (s.nombre<>'Persona QA' OR s.apellido<>'Prueba' OR s.estado<>'solicitada' OR s.id_pais IS NULL)) THEN RAISE EXCEPTION 'Datos de recepción incorrectos'; END IF;
  IF envio ?| ARRAY['correo','nombre','apellido','id_coordinador'] THEN RAISE EXCEPTION 'Confirmación pública excesiva'; END IF;
  SELECT count(*) INTO antes FROM public.solicitudes_cotizacion;
  BEGIN
    PERFORM public.registrar_solicitud_cotizacion(jsonb_build_object('nombre','QA','apellido','Prueba','correo','invalido','items',items));
    RAISE EXCEPTION 'Se permitió correo inválido';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT count(*) FROM public.solicitudes_cotizacion)<>antes THEN RAISE EXCEPTION 'Se guardaron datos parciales'; END IF;
  SELECT a.id_usuario INTO admin_id FROM public.asignaciones_roles a JOIN public.roles r ON r.id_rol=a.id_rol AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL
    JOIN public.perfiles p ON p.id_usuario=a.id_usuario AND p.activo AND p.archived_at IS NULL WHERE a.revocado_at IS NULL AND a.archived_at IS NULL LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'Se requiere un ADMIN activo para verificar la bandeja'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  fila:=public.gestionar_solicitudes_cotizacion('get',jsonb_build_object('id_solicitud',envio->>'id_solicitud'));
  fila:=public.gestionar_solicitudes_cotizacion('update',jsonb_build_object('id_solicitud',fila->>'id_solicitud','version_esperada',(fila->>'version')::bigint,'estado','en_gestion'));
  IF fila->>'estado'<>'en_gestion' THEN RAISE EXCEPTION 'No se actualizó el estado'; END IF;
  INSERT INTO scrum163_verificacion VALUES(jsonb_build_object('resultado','OK','solicitudes_por_pais',numero,'contacto_y_detalles',true,
    'confirmacion_publica_acotada',true,'datos_invalidos_rechazados',true,'consulta_y_estado',true,'datos_prueba','se revierten al terminar'));
END $$;
SELECT resultado FROM scrum163_verificacion;
ROLLBACK;
