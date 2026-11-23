import { z } from 'zod';

export const cantidadSchema = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const numeroFormularioSchema = z.string().trim()
  .min(1, 'Ingresa un valor.').regex(/^\d+(?:[.,]\d+)?$/, 'Ingresa un número mayor o igual a cero.')
  .transform(v => Number(v.replace(',', '.')))
  .pipe(cantidadSchema);
export const fechaSchema = z.string().refine(v => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [yearStr] = v.split('-');
  const year = Number(yearStr);
  const fecha = new Date(`${v}T00:00:00Z`);
  const hoy = new Date();
  
  return (
    year >= 2000 &&
    year <= 2100 &&
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().slice(0, 10) === v &&
    fecha <= hoy
  );
}, 'Ingresa una fecha de medición válida y que no sea futura.');
export const resultadoFormularioSchema = z.object({
  valor_medido: numeroFormularioSchema,
  fecha_medicion: fechaSchema,
  observaciones: z.string().trim().max(1000, 'Las observaciones no pueden superar 1000 caracteres.'),
});
export const catalogoSchema = z.object({
  id_indicador: z.uuid(), codigo: z.string().min(1), nombre: z.string().min(1),
  unidad_medida: z.string().min(1), descripcion: z.string(),
});
export const resultadoSchema = z.object({
  id_resultado: z.uuid(), id_indicador: z.uuid(), valor_medido: z.number().finite(), fecha_medicion: fechaSchema,
  observaciones: z.string().nullable(), version: z.number().int().positive(),
});
export const indicadorAccionSchema = z.object({
  id_indicador: z.uuid(), id_accion: z.uuid(), id_catalogo: z.uuid().nullable(), meta: z.number().finite().nullable(),
  nombre: z.string().min(1).optional(), unidad_medida: z.string().min(1).optional(), descripcion: z.string().optional(),
  version: z.number().int().positive(), resultado: resultadoSchema.nullable(),
}).refine(v => !v.resultado || v.resultado.id_indicador === v.id_indicador, 'El resultado no pertenece al indicador.');
export type IndicadorCatalogo = z.infer<typeof catalogoSchema>;
export type IndicadorAccion = z.infer<typeof indicadorAccionSchema>;
export type Resultado = z.infer<typeof resultadoSchema>;
export type DatosResultado = z.infer<typeof resultadoFormularioSchema>;
export type Asociacion = { id_indicador: string; meta: number };
export interface ServicioIndicadores {
  catalogo(): Promise<IndicadorCatalogo[]>;
  listar(accion: string): Promise<IndicadorAccion[]>;
  asociar(accion: string, entradas: Asociacion[]): Promise<IndicadorAccion[]>;
  actualizarMeta(item: IndicadorAccion, meta: number): Promise<IndicadorAccion>;
  guardarResultado(item: IndicadorAccion, entrada: DatosResultado): Promise<Resultado>;
}
export const hoyLocal = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const mostrarCantidad = (valor: number | null) => valor === null ? 'Sin definir' : valor.toLocaleString('es-CL', { maximumFractionDigits: 10 });
