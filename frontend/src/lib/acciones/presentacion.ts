import type { Accion, EstadoAccion } from '../server/acciones.ts';

export const estadosSeleccionables = [
  { valor: 'no_iniciada', etiqueta: 'No iniciada' },
  { valor: 'en_desarrollo', etiqueta: 'En desarrollo' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
  { valor: 'cumplida', etiqueta: 'Cumplida' },
] as const;

export function etiquetaEstado(estado: EstadoAccion): string {
  // El backend anterior admite este estado: se conserva para leer datos existentes.
  if (estado === 'atrasada') return 'Atrasada (registro anterior)';
  return estadosSeleccionables.find(item => item.valor === estado)?.etiqueta ?? estado;
}

export function fechaLocal(fecha = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

export function estaVencida(accion: Pick<Accion, 'estado' | 'fecha_termino'>, hoy = fechaLocal()): boolean {
  return !['cumplida', 'cancelada'].includes(accion.estado) && accion.fecha_termino < hoy;
}

export function mostrarFecha(valor: string): string {
  return new Date(`${valor}T00:00:00`).toLocaleDateString('es-CL');
}
