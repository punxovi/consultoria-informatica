import type { ApiTransport } from '../api/transporte.ts';
import { ApiError } from '../api/transporte.ts';
import { camposLegalSchema, tiposDocumento, type ExpedienteLegal, type GuardarExpediente, type ServicioExpediente } from './modelo.ts';

function comprobar(valor: unknown, id: string): ExpedienteLegal {
  const datos = valor as ExpedienteLegal;
  const campos = datos && {
    estado_personalidad_juridica: datos.estado_personalidad_juridica,
    tipo_personalidad_juridica: datos.tipo_personalidad_juridica ?? '', numero_registro: datos.numero_registro ?? '',
    fecha_constitucion: datos.fecha_constitucion ?? '', vigencia_directiva: datos.vigencia_directiva ?? '',
  };
  if (!datos || datos.id_organizacion !== id || !datos.id_informacion_legal || !Number.isInteger(datos.version) || datos.version < 1 ||
    !camposLegalSchema.safeParse(campos).success || !Array.isArray(datos.documentos) || datos.documentos.length !== 3 ||
    !tiposDocumento.every(({ id: tipo }) => datos.documentos.filter(doc => doc && doc.tipo === tipo && ['pendiente','no_aplica','cargado'].includes(doc.estado) &&
      (doc.estado !== 'cargado' || typeof doc.nombre_archivo === 'string' && !!doc.nombre_archivo)).length === 1)) {
    throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el expediente recibido.', 502);
  }
  return { ...datos, ...campos } as ExpedienteLegal;
}

export function crearClienteExpediente(transport: ApiTransport, token: () => Promise<string>): ServicioExpediente {
  const ruta = (id: string) => `/api/v1/organizations/${encodeURIComponent(id)}/legal-record`;
  async function guardar(id: string, entrada: GuardarExpediente, version?: number): Promise<ExpedienteLegal> {
    const body = new FormData();
    body.set('datos', JSON.stringify({ ...entrada.campos,
      documentos: entrada.documentos.map(({ tipo, estado }) => ({ tipo, estado })),
      ...(version === undefined ? {} : { version_esperada: version }),
    }));
    for (const { id: tipo } of tiposDocumento) {
      if (entrada.archivos[tipo]) body.set(tipo, entrada.archivos[tipo]!);
    }
    const respuesta = await transport.request<{ expediente: ExpedienteLegal }>(ruta(id), {
      method: version === undefined ? 'POST' : 'PATCH', accessToken: await token(), body,
    });
    return comprobar(respuesta.data?.expediente, id);
  }
  return {
    async obtener(id) {
      const respuesta = await transport.request<{ expediente: ExpedienteLegal | null }>(ruta(id), { accessToken: await token() });
      if (respuesta.data?.expediente === null) return null;
      return comprobar(respuesta.data?.expediente, id);
    },
    crear: (id, entrada) => guardar(id, entrada),
    actualizar: (id, version, entrada) => guardar(id, entrada, version),
  };
}
