import { z } from 'zod';
export const estadoSchema = z.enum(['solicitada','en_gestion','cotizada','cerrada','rechazada']);
export const etiquetas = { solicitada:'Nueva', en_gestion:'En gestión', cotizada:'Cotizada', cerrada:'Cerrada', rechazada:'Rechazada' };
export const solicitudSchema = z.object({
  id_solicitud: z.string().min(1), nombre_solicitante: z.string(), correo: z.string(),
  telefono: z.string().nullable(), mensaje: z.string().nullable(),
  created_at: z.iso.datetime({offset:true}), estado: estadoSchema, version: z.number().int().positive(),
  estados_permitidos: z.array(estadoSchema),
  items: z.array(z.object({
    id_producto: z.string().min(1), nombre_producto: z.string(), unidad_medida: z.string(), cantidad: z.number().positive(),
    organizacion: z.object({id_organizacion:z.string(),nombre:z.string(),pais:z.object({id_pais:z.string(),nombre:z.string()})}),
  })).min(1),
});
export type Solicitud = z.infer<typeof solicitudSchema>;
export type Estado = z.infer<typeof estadoSchema>;
