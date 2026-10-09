import { z } from 'zod';

const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  { message: 'Debe ser un UUID válido.' }
);

export const crearDiagnosticoZodSchema = z.object({
  id_organizacion: uuidSchema,
  titulo: z.string().trim().min(1, { message: 'El título del diagnóstico es obligatorio.' }).max(150, { message: 'El título no puede superar los 150 caracteres.' }),
  descripcion: z.string().trim().min(1, { message: 'La descripción del diagnóstico es obligatoria.' }).max(2000, { message: 'La descripción no puede superar los 2000 caracteres.' }),
  estado: z.enum(['borrador', 'en_revision', 'completado', 'archivado'], { message: 'El estado del diagnóstico no es válido.' }).optional(),
}).strict();

export const actualizarDiagnosticoZodSchema = z.object({
  version_esperada: z.number().int().min(1, { message: 'La versión esperada debe ser un entero mayor que cero.' }).optional(),
  cambios: z.object({
    titulo: z.string().trim().min(1, { message: 'El título es obligatorio.' }).max(150).optional(),
    descripcion: z.string().trim().min(1, { message: 'La descripción es obligatoria.' }).max(2000).optional(),
    estado: z.enum(['borrador', 'en_revision', 'completado', 'archivado'], { message: 'El estado no es válido.' }).optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar.',
  }),
}).strict();

export type CrearDiagnosticoData = z.infer<typeof crearDiagnosticoZodSchema>;
export type ActualizarDiagnosticoData = z.infer<typeof actualizarDiagnosticoZodSchema>;