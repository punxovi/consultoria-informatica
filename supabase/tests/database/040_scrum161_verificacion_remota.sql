-- Ejecutar en SQL Editor DESPUÉS de aplicar 20261103150000_fge_scrum161_catalogo_productos.sql.
-- Usa una Organización existente. Los datos sintéticos se revierten al terminar.
-- No sube imágenes: verifica sus metadatos y relación con el almacenamiento existente.
BEGIN;
CREATE TEMP TABLE scrum161_verificacion(resultado jsonb) ON COMMIT DROP;
DO $$
DECLARE
  organizacion uuid;
  pais uuid;
  producto uuid := gen_random_uuid();
  imagen uuid := gen_random_uuid();
  cantidad_imagenes integer;
BEGIN
  SELECT o.id_organizacion, o.id_pais INTO organizacion, pais
  FROM public.organizaciones o JOIN public.paises p ON p.id_pais = o.id_pais
  WHERE o.archived_at IS NULL AND p.archived_at IS NULL
  ORDER BY o.id_organizacion LIMIT 1;
  IF organizacion IS NULL THEN
    RAISE EXCEPTION 'Se requiere una Organización activa existente para comprobar la persistencia';
  END IF;
  INSERT INTO public.productos(id_producto,id_organizacion,nombre,descripcion,unidad_medida,tipo_item,categoria,material_terminacion,caracteristicas,informacion_adicional)
  VALUES(producto,organizacion,'QA SCRUM-161','Producto sintético, se revierte al terminar','unidad','producto','Artesanía','Tela',
    '{"color":"azul","medidas":"30 x 20 cm"}'::jsonb,'Comprobación transaccional de persistencia');
  IF NOT EXISTS (SELECT 1 FROM public.productos_por_territorio p WHERE p.id_producto = producto AND p.id_pais = pais AND NOT p.publicado) THEN
    RAISE EXCEPTION 'Falló la relación del producto con su Organización y país';
  END IF;
  INSERT INTO public.archivos(id_producto,ruta_objeto,nombre_original,mime_type,tamano_bytes,categoria)
  VALUES(producto,'productos/' || producto || '/' || imagen || '.png','qa-1.png','image/png',100,'imagen_producto'),
    (producto,'productos/' || producto || '/' || gen_random_uuid() || '.webp','qa-2.webp','image/webp',120,'imagen_producto');
  SELECT count(*) INTO cantidad_imagenes FROM public.archivos a WHERE a.id_producto = producto;
  IF cantidad_imagenes <> 2 THEN RAISE EXCEPTION 'Falló la asociación de múltiples imágenes'; END IF;
  UPDATE public.productos SET publicado=true, material_terminacion='Tela reciclada' WHERE id_producto=producto;
  IF NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id_producto=producto AND p.publicado AND p.material_terminacion='Tela reciclada') THEN
    RAISE EXCEPTION 'Falló la persistencia de la modificación';
  END IF;
  UPDATE public.productos SET publicado=false, archived_at=now() WHERE id_producto=producto;
  IF EXISTS (SELECT 1 FROM public.productos_por_territorio p WHERE p.id_producto=producto)
    OR NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id_producto=producto AND p.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Falló el archivado lógico';
  END IF;
  INSERT INTO scrum161_verificacion VALUES(jsonb_build_object(
    'resultado','OK','producto_y_organizacion',true,'pais_coherente',true,
    'multiples_imagenes',cantidad_imagenes,'modificacion',true,'archivado_logico',true,
    'bucket_privado',EXISTS(SELECT 1 FROM storage.buckets WHERE id='fge-archivos' AND NOT public),
    'permisos_autenticados','verificados en la suite local; esta consulta usa SQL Editor',
    'datos_prueba','se revierten al terminar'));
END $$;
SELECT resultado FROM scrum161_verificacion;
ROLLBACK;
