ALTER TABLE public.donaciones
  ADD COLUMN entrega_certificado text
  CHECK (entrega_certificado IN ('pendiente', 'entregado'));
