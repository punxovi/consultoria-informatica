import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { camposDiagnosticoSchema, type Diagnostico, type ServicioDiagnostico } from './modelo.ts';

const registroSchema = z.object({
  id_diagnostico: z.uuid(),
  id_organizacion: z.uuid(),
  fecha_diagnostico: z.iso.date(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).passthrough();

function comprobar(valor: unknown, organizacion: string, id?: string): Diagnostico {
  const registro = registroSchema.safeParse(valor);
  if (!registro.success || registro.data.id_organizacion !== organizacion ||
      (id !== undefined && registro.data.id_diagnostico !== id)) {
    throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el diagnóstico recibido.', 502);
  }
  const campos = Object.fromEntries(Object.keys(camposDiagnosticoSchema.shape).map(campo => [campo, registro.data[campo]]));
  const resultado = camposDiagnosticoSchema.safeParse(campos);
  if (!resultado.success) throw new ApiError('RESPUESTA_INVALIDA', 'El diagnóstico recibido está incompleto o no es válido.', 502);
  return { ...registro.data, ...resultado.data };
}

export function crearClienteDiagnostico(transport: ApiTransport, token: () => Promise<string>): ServicioDiagnostico {
  const ruta = (id: string) => `/api/v1/organizations/${encodeURIComponent(id)}/diagnosticos`;
  return {
    async obtener(id) {
      const respuesta = await transport.request<{ diagnosticos: unknown[] }>(ruta(id), { accessToken: await token() });
      const registros = respuesta.data?.diagnosticos;
      if (!Array.isArray(registros) || registros.length > 1) {
        throw new ApiError('RESPUESTA_INVALIDA', 'No fue posible interpretar el diagnóstico recibido.', 502);
      }
      return registros.length === 0 ? null : comprobar(registros[0], id);
    },
    async crear(id, entrada) {
      const respuesta = await transport.request<{ diagnostico: unknown }>(ruta(id), {
        method: 'POST', accessToken: await token(), body: camposDiagnosticoSchema.parse(entrada.campos),
      });
      return comprobar(respuesta.data?.diagnostico, id);
    },
    async actualizar(id, diagnosticoId, version, entrada) {
      const respuesta = await transport.request<{ diagnostico: unknown }>(`${ruta(id)}/${encodeURIComponent(diagnosticoId)}`, {
        method: 'PATCH', accessToken: await token(),
        body: { version_esperada: version, cambios: camposDiagnosticoSchema.parse(entrada.campos) },
      });
      return comprobar(respuesta.data?.diagnostico, id, diagnosticoId);
    },
  };
}
