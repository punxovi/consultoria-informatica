// Íconos únicos de las acciones comunes: todos los botones Editar, Actualizar,
// Limpiar y Eliminar de la aplicación usan exactamente estos trazos.
export const trazosIcono = {
  editar: 'm16.862 4.487 2.65 2.65M8 17l-4 1 1-4L16.862 2.138a2 2 0 0 1 2.829 0l1.171 1.171a2 2 0 0 1 0 2.829L8 17Z',
  actualizar: 'M20 7v5h-5M4 17v-5h5m-4.5-3A8 8 0 0 1 18 6l2 6M4 12l2 6a8 8 0 0 0 12.5-1',
  limpiar: 'M4 4v6h6M20 20v-6h-6M5.5 9A7 7 0 0 1 18 6l2 4M19 15a7 7 0 0 1-12.5 3L4 14',
  eliminar: 'M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6',
} as const;

export type NombreIcono = keyof typeof trazosIcono;

/** SVG en texto, para botones que se crean desde JavaScript. */
export function iconoSvg(nombre: NombreIcono, clase = 'h-4 w-4'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${clase}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${trazosIcono[nombre]}" /></svg>`;
}
