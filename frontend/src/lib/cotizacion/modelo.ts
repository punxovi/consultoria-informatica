import { z } from 'zod';

export const cantidadSchema = z.number().finite().positive('Ingresa una cantidad mayor que cero.').max(Number.MAX_SAFE_INTEGER, 'La cantidad es demasiado grande.');
export const seleccionSchema = z.array(z.object({ id_producto: z.string().min(1), cantidad: cantidadSchema }));
export type Seleccion = z.infer<typeof seleccionSchema>;
export const formularioSchema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa tu nombre.').max(79, 'Usa hasta 79 caracteres.'),
  apellido: z.string().trim().min(1, 'Ingresa tu apellido.').max(80, 'Usa hasta 80 caracteres.'),
  correo: z.string().trim().min(1, 'Ingresa tu correo.').max(320).pipe(z.email('Ingresa un correo válido.')),
  telefono: z.string().trim().max(60, 'Usa hasta 60 caracteres.'),
  mensaje: z.string().trim().max(2000, 'Usa hasta 2000 caracteres.'),
});
export type Contacto = z.infer<typeof formularioSchema>;
export function prepararSolicitud(contacto: Contacto, seleccion: Seleccion) {
  const datos = formularioSchema.parse(contacto);
  const items = seleccionSchema.min(1, 'Selecciona al menos un producto.').parse(seleccion);
  if (new Set(items.map(i => i.id_producto)).size !== items.length) throw new Error('La selección contiene productos repetidos.');
  return { nombre:datos.nombre,apellido:datos.apellido,nombre_solicitante: `${datos.nombre} ${datos.apellido}`, correo: datos.correo,
    ...(datos.telefono ? { telefono: datos.telefono } : {}), ...(datos.mensaje ? { mensaje: datos.mensaje } : {}), items };
}
