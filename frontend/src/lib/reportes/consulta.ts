import { ApiError } from '../api/transporte.ts';
import type { ReportFilters, ReportPreview } from './pdf.ts';
import { verificarCorrespondencia } from './vista-previa.ts';

export type EstadoConsulta =
  | { tipo: 'inactivo' }
  | { tipo: 'preparada'; parametros: ReportFilters }
  | { tipo: 'carga'; parametros: ReportFilters }
  | { tipo: 'error'; parametros: ReportFilters; mensaje: string; reintentable: boolean }
  | { tipo: 'vacio'; parametros: ReportFilters; vista: ReportPreview }
  | { tipo: 'exito'; parametros: ReportFilters; vista: ReportPreview };

export interface SolicitudReporte {
  parametros: ReportFilters;
  responder(respuesta: Promise<ReportPreview>): void;
}

const celdaCero = /^0+([.,]0+)?$/;

export function reporteSinResultados(vista: ReportPreview): boolean {
  return vista.document.sections.every((seccion) =>
    seccion.rows.length === 0 || seccion.rows.every((fila) => fila.slice(1).every((celda) => celdaCero.test(celda.trim()))),
  );
}

export function describirErrorConsulta(error: unknown): { mensaje: string; reintentable: boolean } {
  if (error instanceof ApiError) {
    if (error.code === 'VISTA_NO_CORRESPONDE') return { mensaje: error.message, reintentable: true };
    if (error.status === 401) return { mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión para consultar el reporte.', reintentable: false };
    if (error.status === 403) return { mensaje: 'Tu cuenta no tiene permiso para consultar reportes con estos criterios.', reintentable: false };
    if (error.status === 400) {
      return { mensaje: error.message || 'Los criterios del reporte no son válidos. Revísalos e inténtalo nuevamente.', reintentable: false };
    }
    if (error.status === 0 || error.status >= 500) {
      return { mensaje: 'No fue posible preparar la vista previa. Revisa tu conexión e inténtalo nuevamente.', reintentable: true };
    }
    return { mensaje: error.message || 'No fue posible preparar la vista previa.', reintentable: true };
  }
  return { mensaje: 'No fue posible preparar la vista previa. Inténtalo nuevamente.', reintentable: true };
}

export function crearControladorConsulta(alCambiar: (estado: EstadoConsulta) => void) {
  let estado: EstadoConsulta = { tipo: 'inactivo' };
  let turno = 0;

  function cambiar(nuevo: EstadoConsulta) {
    estado = nuevo;
    alCambiar(estado);
  }

  return {
    get estado() {
      return estado;
    },

    reiniciar() {
      turno++;
      cambiar({ tipo: 'inactivo' });
    },

    preparar(parametros: ReportFilters): SolicitudReporte['responder'] {
      const propio = ++turno;
      cambiar({ tipo: 'preparada', parametros });
      let usado = false;
      return (respuesta) => {
        if (usado || propio !== turno) return;
        usado = true;
        void atender(propio, parametros, respuesta);
      };
    },
  };

  async function atender(propio: number, parametros: ReportFilters, respuesta: Promise<ReportPreview>) {
    cambiar({ tipo: 'carga', parametros });
    try {
      const vista = await respuesta;
      if (propio !== turno) return;
      if (!vista?.document || !Array.isArray(vista.document.sections)) {
        throw new ApiError('RESPUESTA_INVALIDA', 'La vista previa recibida no es válida.', 502);
      }
      const diferencia = verificarCorrespondencia(vista, parametros);
      if (diferencia) {
        throw new ApiError('VISTA_NO_CORRESPONDE', `La vista previa recibida no corresponde a los criterios solicitados: ${diferencia}. Inténtalo nuevamente.`, 502);
      }
      cambiar(reporteSinResultados(vista) ? { tipo: 'vacio', parametros, vista } : { tipo: 'exito', parametros, vista });
    } catch (error) {
      if (propio !== turno) return;
      cambiar({ tipo: 'error', parametros, ...describirErrorConsulta(error) });
    }
  }
}
