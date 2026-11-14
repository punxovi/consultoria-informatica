import { seleccionSchema, type Seleccion } from './modelo.ts';
const clave = 'fge-cotizacion-seleccion-v1';
export const EVENTO_SELECCION = 'fge:cotizacion-seleccion';
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
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_SELECCION));
}
export function agregarProducto(id: string) {
  const items = leerSeleccion();
  if (!items.some(i => i.id_producto === id)) items.push({ id_producto: id, cantidad: 1 });
  guardarSeleccion(items);
  return items.length;
}
export function cambiarCantidad(id: string, delta: number) {
  const items = leerSeleccion();
  const item = items.find(i => i.id_producto === id);
  if (!item) return 0;
  const nueva = Number((item.cantidad + delta).toFixed(10));
  if (nueva > 0) item.cantidad = nueva;
  guardarSeleccion(items);
  return item.cantidad;
}
export function quitarProducto(id: string) {
  guardarSeleccion(leerSeleccion().filter(i => i.id_producto !== id));
}
