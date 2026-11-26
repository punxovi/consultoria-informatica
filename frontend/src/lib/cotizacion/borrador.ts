import { z } from 'zod';
import type { Contacto } from './modelo.ts';

const clave = 'fge-cotizacion-contacto-v1';
const schema = z.strictObject({
  nombre: z.string().max(79), apellido: z.string().max(80), correo: z.string().max(320),
  telefono: z.string().max(60), mensaje: z.string().max(2000),
});
export function leerBorrador(storage: Pick<Storage, 'getItem'> = sessionStorage): Contacto | null {
  const value = storage.getItem(clave);
  if (!value) return null;
  try { return schema.parse(JSON.parse(value)); } catch { return null; }
}
export function guardarBorrador(contacto: Contacto, storage: Pick<Storage, 'setItem' | 'removeItem'> = sessionStorage) {
  const data = schema.parse(contacto);
  if (Object.values(data).every(value => value.length)) storage.setItem(clave, JSON.stringify(data));
  else limpiarBorrador(storage);
}
export function limpiarBorrador(storage: Pick<Storage, 'removeItem'> = sessionStorage) { storage.removeItem(clave); }
