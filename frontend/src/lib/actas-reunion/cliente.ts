import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { camposActaSchema, type ActaReunion, type GuardarActa, type ServicioActasReunion } from './modelo.ts';

const registroSchema = z.object({
  id_acta: z.string().uuid(),
  id_organizacion: z.string().uuid(),
  id_plan: z.string().uuid(),
  id_accion: z.string().uuid().nullable(),
  fecha_reunion: z.string(),
  asistentes: z.array(z.string()),
  asistentes_externos: z.string(),
  objetivo: z.string(),
  observaciones: z.string().nullable(),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});

function validarRegistro(
  datos: unknown,
  idOrganizacion: string,
  idActa?: string,
): ActaReunion {
  const resultado = registroSchema.safeParse(datos);

  if (
    !resultado.success ||
    resultado.data.id_organizacion !== idOrganizacion ||
    (idActa !== undefined && resultado.data.id_acta !== idActa)
  ) {
    throw new ApiError(
      'RESPUESTA_INVALIDA',
      'No fue posible interpretar el acta recibida del servidor.',
      502,
    );
  }

  return {
    ...resultado.data,
    id_accion: resultado.data.id_accion ?? '',
    observaciones: resultado.data.observaciones ?? '',
  };
}

function prepararCampos(entrada: GuardarActa) {
  const resultado = camposActaSchema.safeParse(entrada.campos);

  if (!resultado.success) {
    throw new ApiError(
      'DATOS_INVALIDOS',
      'Revisa los campos del acta antes de guardarla.',
      400,
    );
  }

  return {
    ...resultado.data,
    id_accion: resultado.data.id_accion || null,
    observaciones: resultado.data.observaciones || null,
  };
}

export function crearClienteActas(
  http: ApiTransport,
  token: () => Promise<string>,
): ServicioActasReunion {
  const base = '/api/v1/meeting-minutes';

  return {
    async obtener(idOrganizacion) {
      const query = new URLSearchParams({
        id_organizacion: idOrganizacion,
      });

      const respuesta = await http.request<{ meetingMinutes: unknown[] }>(
        `${base}?${query}`,
        { accessToken: await token() },
      );

      if (!Array.isArray(respuesta.data?.meetingMinutes)) {
        throw new ApiError(
          'RESPUESTA_INVALIDA',
          'La lista de actas recibida no es válida.',
          502,
        );
      }

      return respuesta.data.meetingMinutes.map((acta) =>
        validarRegistro(acta, idOrganizacion),
      );
    },

    async crear(idOrganizacion, entrada) {
      const respuesta = await http.request<{ meetingMinute: unknown }>(
        base,
        {
          method: 'POST',
          accessToken: await token(),
          body: {
            id_organizacion: idOrganizacion,
            ...prepararCampos(entrada),
          },
        },
      );

      return validarRegistro(
        respuesta.data?.meetingMinute,
        idOrganizacion,
      );
    },

    async actualizar(idOrganizacion, idActa, version, entrada) {
      const respuesta = await http.request<{ meetingMinute: unknown }>(
        `${base}/${encodeURIComponent(idActa)}`,
        {
          method: 'PATCH',
          accessToken: await token(),
          body: {
            version_esperada: version,
            cambios: prepararCampos(entrada),
          },
        },
      );

      return validarRegistro(
        respuesta.data?.meetingMinute,
        idOrganizacion,
        idActa,
      );
    },
  };
}
