import { seleccionSchema, type Seleccion } from './modelo.ts';
const clave = 'fge-cotizacion-seleccion-v1';
// Solo IDs y cantidades durante esta pestaña. Nunca guardar datos de contacto.
export function leerSeleccion(): Seleccion {
  const texto = sessionStorage.getItem(clave);
  if (!texto) return [];
  try {
    const seleccion = seleccionSchema.parse(JSON.parse(texto));
    if (new Set(seleccion.map(i => i.id_producto)).size !== seleccion.length) throw new Error();
    return seleccion;
  } catch { throw new Error('No se pudo recuperar la selección. Restablécela para continuar.'); }
}
export function guardarSeleccion(items: Seleccion) {
  if (!items.length) sessionStorage.removeItem(clave);
  else sessionStorage.setItem(clave, JSON.stringify(seleccionSchema.parse(items)));
}
export function agregarProducto(id: string) {
  const items = leerSeleccion();
  if (!items.some(i => i.id_producto === id)) items.push({ id_producto: id, cantidad: 1 });
  guardarSeleccion(items);
  return items.length;
}
