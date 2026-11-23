BEGIN;
INSERT INTO public.paises(nombre,codigo_iso) VALUES
 ('Argentina','AR'),('Chile','CL'),('Uruguay','UY');
INSERT INTO storage.buckets(id,name,public)
 VALUES ('fge-archivos','fge-archivos',false);
COMMIT;
