-- Permite conservar datos pendientes de las organizaciones recibidas de FGE.
-- Las restricciones CHECK siguen validando los valores cuando se informan.
ALTER TABLE public.organizaciones
  ALTER COLUMN correo DROP NOT NULL,
  ALTER COLUMN region_departamento DROP NOT NULL,
  ALTER COLUMN comuna_municipio_ciudad DROP NOT NULL,
  ALTER COLUMN direccion DROP NOT NULL,
  ALTER COLUMN tipo_organizacion DROP NOT NULL,
  ALTER COLUMN numero_beneficiarios DROP NOT NULL;
