import type { Accion, EstadoAccion } from '../modelos/acciones.ts';

export const estadosSeleccionables = [
  { valor: 'no_iniciada', etiqueta: 'No iniciada' },
  { valor: 'en_desarrollo', etiqueta: 'En desarrollo' },
  { valor: 'cancelada', etiqueta: 'Cancelada' },
  { valor: 'cumplida', etiqueta: 'Cumplida' },
] as const;

export function etiquetaEstado(estado: EstadoAccion): string {
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

export type NivelUrgencia =
  | 'baja'
  | 'media'
  | 'alta'
  | 'vencida'
  | 'sin_urgencia';

export function calcularNivelUrgencia(accion: Pick<Accion, 'estado' | 'fecha_termino'>, hoy = fechaLocal()): NivelUrgencia {
  if (accion.estado === 'cumplida' || accion.estado === 'cancelada') {
    return 'sin_urgencia';
  }

  const fechaTermino = Date.parse(accion.fecha_termino);
  const fechaActual = Date.parse(hoy);
  const diasRestantes = (fechaTermino - fechaActual) / 86_400_000;

  if (diasRestantes < 0) {
    return 'vencida';
  }

  if (diasRestantes > 15) {
    return 'baja';
  }

  if (diasRestantes >= 6) {
    return 'media';
  }

  return 'alta';
}