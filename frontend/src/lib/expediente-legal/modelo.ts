import { z } from 'zod';

export const tiposDocumento = [
  { id: 'identidad_representante', nombre: 'Identidad del representante legal' },
  { id: 'identificacion_legal', nombre: 'Identificación legal de la organización' },
  { id: 'estatutos', nombre: 'Estatutos de la organización' },
] as const;
export type TipoDocumento = typeof tiposDocumento[number]['id'];
const texto = (max: number) => z.string().trim().max(max, `No puede superar ${max} caracteres.`);
const fecha = texto(10).refine(valor => !valor || (
  /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) &&
  new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor
), 'Ingresa una fecha válida.');

export const camposLegalSchema = z.object({
  estado_personalidad_juridica: z.enum(['si', 'no', 'en_proceso'], { error: 'Selecciona si posee personalidad jurídica.' }),
  tipo_personalidad_juridica: z.enum(['', 'PJ', 'ONG', 'Fundación']),
  numero_registro: texto(150),
  fecha_constitucion: fecha,
  vigencia_directiva: texto(300),
}).strict();
export type CamposLegal = z.infer<typeof camposLegalSchema>;
export interface DocumentoLegal {
  tipo: TipoDocumento;
  estado: 'pendiente' | 'no_aplica' | 'cargado';
  nombre_archivo: string | null;
}
export interface ExpedienteLegal extends CamposLegal {
  id_informacion_legal: string;
  id_organizacion: string;
  version: number;
  updated_at: string;
  documentos: DocumentoLegal[];
}
export interface GuardarExpediente {
  campos: CamposLegal;
  documentos: DocumentoLegal[];
  archivos: Partial<Record<TipoDocumento, File>>;
}
export interface ServicioExpediente {
  obtener(idOrganizacion: string): Promise<ExpedienteLegal | null>;
  crear(idOrganizacion: string, entrada: GuardarExpediente): Promise<ExpedienteLegal>;
  actualizar(idOrganizacion: string, version: number, entrada: GuardarExpediente): Promise<ExpedienteLegal>;
}
export function validarPdf(archivo: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!/\.pdf$/i.test(archivo.name) || (archivo.type && archivo.type !== 'application/pdf')) return 'Solo se permiten archivos PDF.';
  if (archivo.size === 0) return 'El archivo está vacío.';
  if (archivo.size > 10 * 1024 * 1024) return 'El PDF no puede superar 10 MB.';
  return null;
}
export const documentosVacios = (): DocumentoLegal[] => tiposDocumento.map(({ id }) => ({ tipo: id, estado: 'pendiente', nombre_archivo: null }));
