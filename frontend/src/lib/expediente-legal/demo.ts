import type { ExpedienteLegal, GuardarExpediente, ServicioExpediente } from './modelo.ts';

/** Solo se importa en desarrollo, por solicitud explícita. No persiste datos ni archivos. */
export function crearDemoExpediente(): ServicioExpediente {
  const registros = new Map<string, ExpedienteLegal>();
  async function guardar(id: string, entrada: GuardarExpediente): Promise<ExpedienteLegal> {
    await new Promise(resolve => setTimeout(resolve, 250));
    const anterior = registros.get(id);
    const expediente: ExpedienteLegal = {
      ...entrada.campos, id_organizacion: id, id_informacion_legal: anterior?.id_informacion_legal ?? crypto.randomUUID(),
      version: (anterior?.version ?? 0) + 1, updated_at: new Date().toISOString(),
      documentos: entrada.documentos.map(doc => entrada.archivos[doc.tipo]
        ? { tipo: doc.tipo, estado: 'cargado', nombre_archivo: entrada.archivos[doc.tipo]!.name } : { ...doc }),
    };
    registros.set(id, expediente);
    return structuredClone(expediente);
  }
  return { obtener: async id => structuredClone(registros.get(id) ?? null), crear: guardar, actualizar: (id, _version, entrada) => guardar(id, entrada) };
}
