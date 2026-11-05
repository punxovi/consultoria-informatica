BEGIN;

ALTER TABLE public.archivos DROP CONSTRAINT IF EXISTS archivo_categoria_destino;
ALTER TABLE public.archivos ADD CONSTRAINT archivo_categoria_destino CHECK (
  (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
  (id_informacion_legal IS NOT NULL AND categoria IN ('identidad_representante','identificacion_legal','estatutos','otro_legal')) OR
  (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
  (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
  (id_donacion IS NOT NULL AND categoria IN ('comprobante','acta_entrega','certificado','fotografia','respaldo_donacion')) OR
  (id_producto IS NOT NULL AND (
    categoria = 'ficha_tecnica' OR
    (categoria = 'imagen_producto' AND mime_type IN ('image/jpeg','image/png','image/webp'))
  ))
);

NOTIFY pgrst, 'reload schema';
COMMIT;
