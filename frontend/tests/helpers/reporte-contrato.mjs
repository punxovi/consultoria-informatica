// Respuestas SIMULADAS del servicio de reportes para pruebas. Se construyen con la misma
// función del Backend que arma el documento (prepareReportDocument), para que las pruebas
// de la vista previa usen el contrato real y no un formato inventado.
import { prepareReportDocument } from '../../../backend/services/insights/src/domain/report-document.ts';

const vacias = () => ({ organizations: [], plans: [], actions: [], commitments: [], donations: [], indicators: [], results: [] });

// `parametros` usa el formato del frontend (ReportFilters); `secciones` el del consolidado.
export function respuestaSimulada(parametros, secciones = {}, resumen = {}) {
  const filters = {
    startDate: parametros.fecha_inicio,
    endDate: parametros.fecha_termino,
    ...(parametros.id_pais ? { countryId: parametros.id_pais } : {}),
    ...(parametros.id_organizacion ? { organizationId: parametros.id_organizacion } : {}),
    ...(parametros.id_programa ? { programId: parametros.id_programa } : {}),
    ...(parametros.indicadores ? { indicatorIds: parametros.indicadores } : {}),
    ...(parametros.resultados ? { resultIds: parametros.resultados } : {}),
  };
  const destination = parametros.destino ?? 'interno';
  const snapshot = {
    generatedAt: '2026-10-24T12:00:00.000Z',
    period: { start: filters.startDate, end: filters.endDate },
    filters,
    sections: { ...vacias(), ...secciones },
    summary: { totalBeneficiaries: 0, totalDonationsAmount: 0, completedActions: 0, ...resumen },
  };
  const document = prepareReportDocument(snapshot, { filters, destination });
  return {
    destination,
    title: 'Reporte Consolidado Institucional',
    document,
    download: {
      id: '13800000-0000-4000-8000-000000000001',
      url: '/api/v1/reports/13800000-0000-4000-8000-000000000001/pdf',
      fileName: `reporte-fge-${filters.startDate}_${filters.endDate}-${destination}.pdf`,
      mimeType: 'application/pdf',
      expiresAt: '2026-10-24T12:05:00.000Z',
    },
  };
}

// Consolidado con al menos un registro por sección (las acciones y compromisos cumplidos
// alimentan "Acciones ejecutadas" y "Compromisos cumplidos").
export const consolidadoConDatos = {
  organizations: [
    { id_organizacion: 'o1', nombre: 'Comedor Las Palmas', numero_beneficiarios: 120, pais: 'Chile' },
    { id_organizacion: 'o2', nombre: 'Centro Esperanza', numero_beneficiarios: 35, pais: 'Chile' },
  ],
  plans: [{ id_plan: 'p1', nombre: 'Plan Nutrición 2026', organizacion: 'Comedor Las Palmas', programa: 'Programa Alimentación', fecha_inicio: '2026-01-10', fecha_termino: '2026-11-30' }],
  actions: [
    { id_accion: 'a1', nombre: 'Entrega de canastas', estado: 'cumplida', fecha_inicio: '2026-02-01', fecha_termino: '2026-03-01', plan: 'Plan Nutrición 2026' },
    { id_accion: 'a2', nombre: 'Taller de cocina', estado: 'en_proceso', fecha_inicio: '2026-04-01', fecha_termino: '2026-12-01', plan: 'Plan Nutrición 2026' },
  ],
  commitments: [
    { id_compromiso: 'c1', acuerdo: 'Habilitar bodega', estado: 'cumplido', fecha_cumplimiento: '2026-05-20', organizacion: 'Asociada a un acta' },
    { id_compromiso: 'c2', acuerdo: 'Gestionar refrigerador', estado: 'pendiente', fecha_cumplimiento: null, organizacion: 'Asociada a un acta' },
  ],
  donations: [{ id_donacion: 'd1', fecha: '2026-06-15', tipo_aporte: 'dinero', monto: 150000.5, cantidad: null, organizacion: 'Comedor Las Palmas' }],
  indicators: [{ nombre: 'Raciones entregadas', organizacion: 'Comedor Las Palmas', valor_obtenido: 1840 }],
  results: [{ descripcion: 'Familias con alimentación regular', organizacion: 'Comedor Las Palmas', fecha_obtencion: '2026-09-30' }],
};
export const resumenConDatos = { totalBeneficiaries: 155, totalDonationsAmount: 150000.5, completedActions: 1 };
