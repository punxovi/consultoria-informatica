import { ApiError } from '../api/transporte.ts';
import { cantidadSchema, type IndicadorCatalogo, type IndicadorAccion, type ServicioIndicadores } from './modelo.ts';

// Solo catálogo de demostración: sus UUID no deben utilizarse con el backend real.
export const catalogoDemo: IndicadorCatalogo[] = [
  { id_indicador: '11200000-0000-4000-8000-000000000001', codigo: 'beneficiarios', nombre: 'Número de beneficiarios', unidad_medida: 'Beneficiarios', descripcion: 'Personas beneficiadas por la acción.' },
  { id_indicador: '11200000-0000-4000-8000-000000000002', codigo: 'participantes', nombre: 'Número de participantes', unidad_medida: 'Participantes', descripcion: 'Personas que participan en la actividad.' },
  { id_indicador: '11200000-0000-4000-8000-000000000003', codigo: 'capacitaciones', nombre: 'Número de capacitaciones', unidad_medida: 'Capacitaciones', descripcion: 'Capacitaciones realizadas durante la acción.' },
  { id_indicador: '11200000-0000-4000-8000-000000000004', codigo: 'raciones', nombre: 'Número de raciones', unidad_medida: 'Raciones', descripcion: 'Raciones entregadas durante la intervención.' },
  { id_indicador: '11200000-0000-4000-8000-000000000005', codigo: 'acciones_ejecutadas', nombre: 'Acciones ejecutadas', unidad_medida: 'Acciones', descripcion: 'Acciones ejecutadas en el trabajo registrado.' },
];
export function crearDemoIndicadores(): ServicioIndicadores {
  const registros = new Map<string, IndicadorAccion>();
  const pausa = () => new Promise(r => setTimeout(r, 200));
  function vigente(item: IndicadorAccion) {
    const actual = registros.get(item.id_indicador);
    if (!actual || actual.id_accion !== item.id_accion) throw new ApiError('NO_ENCONTRADO', 'El indicador no existe.', 404);
    return actual;
  }
  return {
    async catalogo() { await pausa(); return structuredClone(catalogoDemo); },
    async listar(accion) { await pausa(); return structuredClone([...registros.values()].filter(i => i.id_accion === accion)); },
    async asociar(accion, entradas) {
      await pausa();
      if (!entradas.length || new Set(entradas.map(e => e.id_indicador)).size !== entradas.length) throw new Error('Selecciona indicadores diferentes.');
      for (const e of entradas) {
        cantidadSchema.parse(e.meta);
        if (!catalogoDemo.some(c => c.id_indicador === e.id_indicador)) throw new Error('El indicador no pertenece al catálogo.');
        if ([...registros.values()].some(i => i.id_accion === accion && i.id_catalogo === e.id_indicador)) throw new ApiError('INDICADOR_DUPLICADO', 'Este indicador ya está asociado. Recarga los datos.', 409);
      }
      const nuevos = entradas.map(e => ({ id_indicador: crypto.randomUUID(), id_accion: accion, id_catalogo: e.id_indicador, meta: e.meta, version: 1, resultado: null }));
      nuevos.forEach(i => registros.set(i.id_indicador, i)); return structuredClone(nuevos);
    },
    async actualizarMeta(item, meta) {
      await pausa(); const actual = vigente(item);
      if (actual.version !== item.version) throw new ApiError('CONFLICTO_CONCURRENCIA', 'La meta cambió. Recarga los datos.', 409);
      const nuevo = { ...actual, meta: cantidadSchema.parse(meta), version: actual.version + 1 };
      registros.set(nuevo.id_indicador, nuevo); return structuredClone(nuevo);
    },
    async guardarResultado(item, entrada) {
      await pausa(); const actual = vigente(item);
      if ((actual.resultado?.version ?? null) !== (item.resultado?.version ?? null)) throw new ApiError('CONFLICTO_CONCURRENCIA', 'El resultado cambió. Recarga los datos.', 409);
      const resultado = { ...entrada, valor_medido: cantidadSchema.parse(entrada.valor_medido), id_resultado: actual.resultado?.id_resultado ?? crypto.randomUUID(),
        id_indicador: item.id_indicador, version: (actual.resultado?.version ?? 0) + 1 };
      registros.set(item.id_indicador, { ...actual, resultado }); return structuredClone(resultado);
    },
  };
}
