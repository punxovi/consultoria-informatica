import { ApiError } from '../api/transporte.ts';
import { crearDemoActas } from '../actas-reunion/demo.ts';
import { camposCompromisoSchema, guardarCompromisoSchema, type CamposCompromiso, type Compromiso, type ServicioCompromisos } from './modelo.ts';

const registros = new Map<string, Compromiso>();
const pausa = () => new Promise(resolve => setTimeout(resolve, 200));
export function registrarCompromisosDelActa(org: string, idActa: string, campos: CamposCompromiso[]) {
  const entradas = campos.map(c => camposCompromisoSchema.parse(c));
  const ahora = new Date().toISOString();
  for (const entrada of entradas) {
    const registro: Compromiso = { ...entrada, id_acta: idActa, estado: 'pendiente', id_compromiso: crypto.randomUUID(),
      id_organizacion: org, version: 1, created_at: ahora, updated_at: ahora, cumplido_at: null };
    registros.set(registro.id_compromiso, registro);
  }
}
export function compromisosDelActa(org: string, id: string) {
  return structuredClone([...registros.values()].filter(c => c.id_organizacion === org && c.id_acta === id));
}
export function crearDemoCompromisos(): ServicioCompromisos {
  const actas = crearDemoActas();
  function buscar(org: string, id: string) {
    const r = registros.get(id);
    if (!r || r.id_organizacion !== org) throw new ApiError('NO_ENCONTRADO', 'El compromiso no existe.', 404);
    return r;
  }
  return {
    async listar(org) { await pausa(); return structuredClone([...registros.values()].filter(c => c.id_organizacion === org)); },
    async actas(org) { return (await actas.obtener(org)).map(a => ({ id_acta: a.id_acta, nombre: `Acta del ${a.fecha_reunion}: ${a.objetivo || 'Reunión'}` })); },
    async obtener(org, id) { await pausa(); return structuredClone(buscar(org, id)); },
    async crear(org, entrada) {
      await pausa();
      const datos = guardarCompromisoSchema.parse(entrada);
      if (!(await actas.obtener(org)).some(a => a.id_acta === datos.id_acta)) throw new Error('Selecciona un acta de esta organización.');
      const ahora = new Date().toISOString();
      const r: Compromiso = { ...datos, estado: 'pendiente', id_compromiso: crypto.randomUUID(), id_organizacion: org,
        version: 1, created_at: ahora, updated_at: ahora, cumplido_at: null };
      registros.set(r.id_compromiso, r); return structuredClone(r);
    },
    async actualizar(org, id, version, entrada) {
      await pausa();
      const anterior = buscar(org, id);
      if (anterior.version !== version) throw new ApiError('CONFLICTO', 'El compromiso cambió. Recarga los datos antes de guardar.', 409);
      const datos = guardarCompromisoSchema.parse(entrada);
      if (datos.id_acta !== anterior.id_acta) throw new Error('No se puede cambiar el acta de origen al editar.');
      const ahora = new Date().toISOString();
      const r: Compromiso = { ...anterior, ...datos, version: version + 1, updated_at: ahora,
        cumplido_at: datos.estado === 'cumplido' ? anterior.cumplido_at ?? ahora : null };
      registros.set(id, r); return structuredClone(r);
    },
  };
}
