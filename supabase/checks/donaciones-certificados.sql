BEGIN;
CREATE TEMP TABLE qa_donacion_certificados_resultado(resultado jsonb) ON COMMIT DROP;
DO $qa$
DECLARE
  actor uuid; org uuid; pais uuid;
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid();
  f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid();
  p jsonb; n bigint; v bigint;
BEGIN
  SELECT a.id_usuario INTO actor FROM public.asignaciones_roles a
  JOIN public.roles r USING(id_rol)
  WHERE r.codigo = 'ADMIN' AND a.archived_at IS NULL AND a.revocado_at IS NULL
    AND r.activo AND r.archived_at IS NULL LIMIT 1;
  SELECT id_organizacion,id_pais INTO org,pais FROM public.organizaciones
    WHERE archived_at IS NULL LIMIT 1;
  IF actor IS NULL OR org IS NULL THEN
    RAISE EXCEPTION 'Falta una organización o usuario ADMIN de prueba';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.donaciones
    (id_donacion,id_organizacion,id_pais,fecha,tipo_movimiento,contraparte_nombre,descripcion,tipo_aporte,monto,moneda)
  VALUES
    (d1,org,pais,current_date,'recibida','CONTRAPARTE QA CERTIFICADOS','Prueba transaccional sin persistencia final','dinero',10,'CLP'),
    (d2,org,pais,current_date,'entregada','CONTRAPARTE QA CERTIFICADOS','Prueba transaccional sin persistencia final','dinero',10,'CLP');
  SELECT emisor INTO p FROM public.donaciones_partes WHERE id_donacion = d1;
  IF p->>'tipo' <> 'contraparte' THEN RAISE EXCEPTION 'Emisor recibido incorrecto'; END IF;
  SELECT emisor INTO p FROM public.donaciones_partes WHERE id_donacion = d2;
  IF p->>'id_organizacion' <> org::text OR p->>'id_pais' <> pais::text THEN
    RAISE EXCEPTION 'Emisor entregado incorrecto';
  END IF;
  INSERT INTO public.archivos
    (id_archivo,id_donacion,bucket_id,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria,tipo_respaldo,descripcion)
  VALUES
    (f1,d1,'fge-archivos','donaciones/'||d1||'/'||f1||'.pdf','certificado-qa.pdf','application/pdf',20,'certificado','certificado','QA transaccional'),
    (f2,d1,'fge-archivos','donaciones/'||d1||'/'||f2||'.pdf','respaldo-qa.pdf','application/pdf',20,'comprobante','comprobante','QA transaccional');
  SELECT count(*) INTO n FROM public.archivos WHERE id_donacion = d1 AND created_by = actor;
  IF n <> 2 THEN RAISE EXCEPTION 'Asociación múltiple o autor incorrecto'; END IF;
  BEGIN
    UPDATE public.archivos SET id_donacion = d2 WHERE id_archivo = f1;
    RAISE EXCEPTION 'Se permitió reasociar';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.archivos SET id_donacion = NULL,id_organizacion = org,
      categoria = 'otro_organizacion',tipo_respaldo = NULL WHERE id_archivo = f1;
    RAISE EXCEPTION 'Se permitió borrar asociación';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.archivos SET tamano_bytes = 99 WHERE id_archivo = f1;
    RAISE EXCEPTION 'Se permitió alterar metadatos';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.donaciones SET id_pais = gen_random_uuid() WHERE id_donacion = d1;
    RAISE EXCEPTION 'Se permitió país ajeno';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  UPDATE public.archivos SET estado_carga = 'fallido' WHERE id_archivo = f1;
  UPDATE public.archivos SET estado_carga = 'reservado' WHERE id_archivo = f1;
  UPDATE public.archivos SET estado_carga = 'disponible' WHERE id_archivo = f1;
  BEGIN
    UPDATE public.archivos SET estado_carga = 'reservado' WHERE id_archivo = f1;
    RAISE EXCEPTION 'Se permitió reemplazar documento disponible';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  SELECT count(*) INTO n FROM public.donaciones_partes WHERE id_donacion IN(d1,d2);
  IF n <> 0 THEN RAISE EXCEPTION 'La vista elude RLS'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT version INTO v FROM public.donaciones WHERE id_donacion = d1;
  PERFORM public.archivar_donacion_segura(d1,v);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.archivos WHERE id_donacion = d1 AND archived_at IS NOT NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'Archivado incompleto'; END IF;
  SELECT count(*) INTO n FROM fge_private.historial_cambios
  WHERE tabla_afectada = 'archivos' AND clave_registro->>'id_archivo' = f1::text AND id_usuario = actor;
  IF n < 5 THEN RAISE EXCEPTION 'Auditoría incompleta'; END IF;
  INSERT INTO qa_donacion_certificados_resultado VALUES(jsonb_build_object(
    'resultado','PASS','motor','Supabase real','rol','authenticated ADMIN',
    'sentidos_validados',2,'documentos_asociados',2,'reasociacion_bloqueada',true,
    'metadatos_protegidos',true,'fk_pais_verificada',true,'rls_verificada',true,
    'auditoria_verificada',true,'archivado_verificado',true,'datos_prueba','ROLLBACK'));
END;
$qa$;
SELECT resultado FROM qa_donacion_certificados_resultado;
ROLLBACK;
