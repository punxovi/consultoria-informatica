-- SCRUM-157: copiar o mover un documento privado también accede a su contenido.
BEGIN;
CREATE OR REPLACE FUNCTION fge_private.auditar_acceso_storage(p_id uuid,p_bucket text,p_ruta text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE personal boolean:=false; actor uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT storage.allow_any_operation(ARRAY[
  'object.copy','object.move','s3.object.copy','s3.upload.part_copy','object.get_authenticated','object.sign','object.sign_many','object.get_signed','render.image_authenticated','render.image_sign','s3.object.get'
 ]) THEN RETURN true; END IF;
 personal:=p_bucket IN ('fge-expedientes-legales','fge-evidencias');
 IF p_bucket='fge-archivos' THEN
  SELECT EXISTS(SELECT 1 FROM public.archivos f WHERE f.bucket_id=p_bucket AND f.ruta_objeto=p_ruta
    AND (f.id_donacion IS NOT NULL OR f.id_informacion_legal IS NOT NULL OR f.categoria='identidad_representante')) INTO personal;
 END IF;
 IF personal THEN
  SELECT p.id_usuario INTO actor FROM public.perfiles p WHERE p.id_usuario=auth.uid();
  INSERT INTO fge_private.historial_cambios(tabla_afectada,clave_registro,tipo_accion,id_usuario,actor_sql,despues,tipo_evento)
  VALUES('storage.objects',jsonb_build_object('id_storage_object',p_id,'bucket_id',p_bucket,'id_usuario_auth',auth.uid()),'INSERT',actor,current_user,
   jsonb_build_object('operacion','solicitud_lectura_documento','origen','storage_rls'),'documento_acceso_storage');
 END IF;
 RETURN true;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
;
