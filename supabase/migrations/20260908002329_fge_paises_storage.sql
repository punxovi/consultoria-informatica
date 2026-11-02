-- Únicamente países confirmados; no se inventan usuarios, roles ni organizaciones.
BEGIN;
INSERT INTO public.paises(nombre,codigo_iso) VALUES
 ('Argentina','AR'),('Chile','CL'),('Uruguay','UY');
-- Bucket privado. Sin políticas: anon/authenticated no pueden operar sus objetos.
-- Tamaños, MIME permitidos y políticas de acceso se acuerdan en la configuración.
INSERT INTO storage.buckets(id,name,public)
 VALUES ('fge-archivos','fge-archivos',false);
COMMIT;
