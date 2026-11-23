import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ConsolidatedReportRequest, ConsolidatedReportSnapshot, ReportDestination } from './insights.ts';

export interface ReportSection { key: string; title: string; columns: string[]; rows: string[][]; note?: string }
export interface ReportDocument {
  title: string; destination: ReportDestination; generatedAt: string;
  period: { start: string; end: string }; filters: string[];
  filterLabels?: string[];
  summary: Array<{ label: string; value: string }>;
  sections: ReportSection[];
}
export interface PdfDownload {
  id: string; url: string; fileName: string; mimeType: 'application/pdf'; expiresAt: string;
}
export interface GeneratedPdf { bytes: Buffer; fileName: string; mimeType: 'application/pdf' }

const invalid = () => new ServiceError('REPORTE_INCONSISTENTE', 'El consolidado no corresponde a la solicitud o contiene datos inválidos.', 502);
const number = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
  return String(value);
};
const text = (value: unknown) => {
  if (typeof value !== 'string' || !value.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw invalid();
  return value;
};
const optionalNumber = (value: unknown) => value == null ? 'No informado' : number(value);
const optionalText = (value: unknown) => value == null ? 'No informado' : text(value);
const filterKey = (filters: ConsolidatedReportRequest['filters']) => JSON.stringify([
  filters.startDate, filters.endDate, filters.countryId ?? null, filters.organizationId ?? null,
  filters.programId ?? null, filters.indicatorIds ?? [], filters.resultIds ?? [],
]);

export function prepareReportDocument(snapshot: ConsolidatedReportSnapshot, request: ConsolidatedReportRequest): ReportDocument {
  if (!snapshot || !snapshot.period || !snapshot.filters || !snapshot.sections || !snapshot.summary
    || snapshot.period.start !== request.filters.startDate || snapshot.period.end !== request.filters.endDate
    || filterKey(snapshot.filters) !== filterKey(request.filters)
    || typeof snapshot.generatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.generatedAt))) throw invalid();
  const keys = ['organizations','plans','actions','commitments','donations','indicators','results'] as const;
  if (keys.some(key => !Array.isArray(snapshot.sections[key])
    || snapshot.sections[key].some(row=>!row||typeof row!=='object'||Array.isArray(row)))) throw invalid();
  if (keys.reduce((count,key) => count + snapshot.sections[key].length,0) > 20_000
    || Buffer.byteLength(JSON.stringify(snapshot),'utf8') > 4 * 1024 * 1024) {
    throw new ServiceError('REPORTE_DEMASIADO_GRANDE', 'El reporte supera el límite de generación; reduce el período o los filtros.', 413);
  }
  const s = snapshot.sections;
  const completed = s.actions.filter(row => row.estado === 'cumplida');
  const fulfilled = s.commitments.filter(row => row.estado === 'cumplido');
  const external = request.destination !== 'interno';
  const sinRegistros = 'selección aplicada (sin registros en el período)';
  const unico = (values: unknown[]) => {
    const names = [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))];
    return names.length ? names.map(text).join(', ') : sinRegistros;
  };
  const porId = <T>(rows: T[], idOf: (row: T) => unknown, nameOf: (row: T) => unknown, ids: string[]) => {
    const found = ids.map(id => { const row = rows.find(r => idOf(r) === id); return row ? nameOf(row) : undefined; })
      .filter((v): v is string => typeof v === 'string');
    const missing = ids.length - found.length;
    const names = found.map(text);
    if (missing) names.push(`${missing} sin registros en el período`);
    return names.join(', ');
  };
  const f = request.filters;
  const filters = [
    f.countryId ? `País: ${external ? 'selección aplicada' : f.countryId}` : 'País: todos los visibles para la sesión',
    f.organizationId ? `Organización: ${external ? 'selección aplicada' : f.organizationId}` : 'Organización: todas las visibles',
    f.programId ? `Programa: ${external ? 'selección aplicada' : f.programId}` : 'Programa: todos los visibles',
    f.indicatorIds ? `Indicadores: ${external ? `${f.indicatorIds.length} seleccionados` : f.indicatorIds.join(', ')}` : 'Indicadores: sin selección adicional',
    f.resultIds ? `Resultados: ${external ? `${f.resultIds.length} seleccionados` : f.resultIds.join(', ')}` : 'Resultados: sin selección adicional',
  ];
  const filterLabels = external ? [...filters] : [
    f.countryId ? `País: ${unico(s.organizations.map(r => r.pais))}` : filters[0],
    f.organizationId ? `Organización: ${porId(s.organizations, r => r.id_organizacion, r => r.nombre, [f.organizationId])}` : filters[1],
    f.programId ? `Programa: ${unico(s.plans.map(r => r.programa))}` : filters[2],
    f.indicatorIds ? `Indicadores: ${porId(s.indicators, r => r.id_indicador, r => r.nombre, f.indicatorIds)}` : filters[3],
    f.resultIds ? `Resultados: ${porId(s.results, r => r.id_resultado, r => r.descripcion, f.resultIds)}` : filters[4],
  ];
  const aggregate = (key: string, title: string, label: string, value: number): ReportSection =>
    ({key,title,columns:['Medida','Valor'],rows:[[label,number(value)]]});
  const sections: ReportSection[] = external ? [
    {key:'organizations',title:'Organizaciones y beneficiarios',columns:['Medida','Valor'],rows:[['Organizaciones',number(s.organizations.length)],['Beneficiarios',number(snapshot.summary.totalBeneficiaries)]]},
    aggregate('plans','Planes de Intervención','Planes',s.plans.length),
    aggregate('actions','Acciones','Acciones',s.actions.length),
    aggregate('completedActions','Acciones ejecutadas','Acciones cumplidas',completed.length),
    aggregate('commitments','Compromisos cumplidos','Compromisos cumplidos',fulfilled.length),
    {key:'donations',title:'Donaciones y recursos',columns:['Medida','Valor'],rows:[['Aportes',number(s.donations.length)],['Importe consolidado',number(snapshot.summary.totalDonationsAmount)]],note:'La fuente consolidada no informa la moneda. No se presume una moneda ni se convierte el importe.'},
    aggregate('indicators','Indicadores','Indicadores',s.indicators.length),
    aggregate('results','Resultados obtenidos','Resultados',s.results.length),
  ] : [
    {key:'organizations',title:'Organizaciones y beneficiarios',columns:['Organización','País','Beneficiarios'],rows:s.organizations.map(r=>[text(r.nombre),text(r.pais),number(r.numero_beneficiarios)])},
    {key:'plans',title:'Planes de Intervención',columns:['Plan','Organización / Programa','Inicio','Término'],rows:s.plans.map(r=>[text(r.nombre),`${text(r.organizacion)}\n${text(r.programa)}`,text(r.fecha_inicio),text(r.fecha_termino)])},
    {key:'actions',title:'Acciones',columns:['Acción','Plan','Estado','Inicio','Término'],rows:s.actions.map(r=>[text(r.nombre),text(r.plan),text(r.estado),text(r.fecha_inicio),text(r.fecha_termino)])},
    {key:'completedActions',title:'Acciones ejecutadas',columns:['Acción cumplida','Plan','Término registrado'],rows:completed.map(r=>[text(r.nombre),text(r.plan),text(r.fecha_termino)])},
    {key:'commitments',title:'Compromisos cumplidos',columns:['Acuerdo','Organización','Cumplimiento'],rows:fulfilled.map(r=>[text(r.acuerdo),text(r.organizacion),optionalText(r.fecha_cumplimiento)])},
    {key:'donations',title:'Donaciones y recursos',columns:['Fecha','Tipo de aporte','Organización','Monto','Cantidad'],rows:s.donations.map(r=>[text(r.fecha),text(r.tipo_aporte),text(r.organizacion),optionalNumber(r.monto),optionalNumber(r.cantidad)]),note:'El consolidado no informa moneda ni unidad de medida. Se reproducen los valores recibidos, sin asumirlas.'},
    {key:'indicators',title:'Indicadores',columns:['Indicador','Organización','Valor obtenido'],rows:s.indicators.map(r=>[text(r.nombre),text(r.organizacion),optionalNumber(r.valor_obtenido)])},
    {key:'results',title:'Resultados obtenidos',columns:['Resultado','Organización','Fecha'],rows:s.results.map(r=>[text(r.descripcion),text(r.organizacion),text(r.fecha_obtencion)])},
  ];
  return {
    title:'Reporte consolidado de intervenciones',destination:request.destination,generatedAt:snapshot.generatedAt,
    period:{...snapshot.period},filters,filterLabels,
    summary:[
      {label:'Beneficiarios',value:number(snapshot.summary.totalBeneficiaries)},
      {label:'Acciones cumplidas',value:number(snapshot.summary.completedActions)},
      {label:'Importe consolidado *',value:number(snapshot.summary.totalDonationsAmount)},
    ],sections,
  };
}

export function pdfFileName(document: ReportDocument): string {
  return `reporte-fge-${document.period.start}_${document.period.end}-${document.destination}.pdf`;
}
