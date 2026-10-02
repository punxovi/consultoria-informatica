import { defineAction } from 'astro:actions';
import { z } from 'zod';
import { crearClienteSupabaseParaAction } from '../lib/server/supabase-actions';

const entrada = z.object({ id: z.string().uuid(), version_esperada: z.number().int().positive() }).strict();

function accionArchivo(tipo: 'plan' | 'accion') {
  return defineAction({
    accept: 'json', input: entrada,
    handler: async (input, context) => {
      try {
        const cliente = crearClienteSupabaseParaAction(context.request);
        const { error } = await cliente.rpc(`archivar_${tipo}_seguro`, {
          p_id: input.id, p_version: input.version_esperada,
        });
        if (error) {
          const codigo = error.code === '40001' ? 'CONFLICTO_CONCURRENCIA' : error.code === '42501' ? 'SIN_PERMISO' : error.code === 'PGRST202' ? 'MIGRACION_PENDIENTE' : 'ERROR_ARCHIVO';
          const mensaje = codigo === 'CONFLICTO_CONCURRENCIA' ? 'El registro cambió o ya fue eliminado. Recarga antes de volver a intentarlo.'
            : codigo === 'SIN_PERMISO' ? 'Tu usuario no tiene permiso para eliminar este registro.'
            : codigo === 'MIGRACION_PENDIENTE' ? 'Falta aplicar la migración de eliminación de Planes y Acciones en Supabase.'
            : 'No fue posible eliminar el registro. Vuelve a intentarlo.';
          return { ok: false, codigo, mensaje, datos: null };
        }
        return { ok: true, codigo: 'REGISTRO_ARCHIVADO', mensaje: 'Registro eliminado.', datos: { id: input.id } };
      } catch {
        return { ok: false, codigo: 'ERROR_INTERNO', mensaje: 'No fue posible completar la eliminación.', datos: null };
      }
    },
  });
}

export const archivarPlanAction = accionArchivo('plan');
export const archivarAccionAction = accionArchivo('accion');
