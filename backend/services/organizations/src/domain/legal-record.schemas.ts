import { z } from 'zod';

export const LEGAL_DOCUMENT_TYPES = [
  'identidad_representante',
  'identificacion_legal',
  'estatutos',
] as const;

export const LEGAL_DOCUMENT_STATUSES = ['pendiente', 'no_aplica', 'cargado'] as const;
export const LEGAL_PERSONALITY_STATUSES = ['si', 'no', 'en_proceso'] as const;
export const LEGAL_PERSONALITY_TYPES = ['', 'PJ', 'ONG', 'Fundación'] as const;

const optionalText = (maximum: number, message: string) => z.string({
  error: 'El campo debe ser texto.',
}).trim().max(maximum, message);

const constitutionDateSchema = optionalText(10, 'La fecha de constitución no puede superar 10 caracteres.')
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'La fecha de constitución debe usar el formato AAAA-MM-DD.',
  })
  .refine((value) => {
    if (!value) return true;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, { message: 'La fecha de constitución no es válida.' })
  .refine((value) => !value || value <= new Date().toISOString().slice(0, 10), {
    message: 'La fecha de constitución no puede ser futura.',
  });

export const legalDocumentSchema = z.object({
  tipo: z.enum(LEGAL_DOCUMENT_TYPES, { error: 'El tipo de documento no es válido.' }),
  estado: z.enum(LEGAL_DOCUMENT_STATUSES, { error: 'El estado del documento no es válido.' }),
}).strict();

export const legalDocumentsSchema = z.array(legalDocumentSchema)
  .length(LEGAL_DOCUMENT_TYPES.length, 'Debes indicar el estado de los tres documentos legales.')
  .superRefine((documents, context) => {
    for (const type of LEGAL_DOCUMENT_TYPES) {
      if (documents.filter(({ tipo }) => tipo === type).length !== 1) {
        context.addIssue({
          code: 'custom',
          message: 'Cada tipo de documento debe aparecer una sola vez.',
          path: ['documentos'],
        });
        return;
      }
    }
  });

const legalRecordFields = {
  estado_personalidad_juridica: z.enum(LEGAL_PERSONALITY_STATUSES, {
    error: 'Selecciona un estado de personalidad jurídica válido.',
  }),
  tipo_personalidad_juridica: z.enum(LEGAL_PERSONALITY_TYPES, {
    error: 'El tipo de personalidad jurídica no es válido.',
  }),
  numero_registro: optionalText(150, 'El número de registro no puede superar 150 caracteres.'),
  fecha_constitucion: constitutionDateSchema,
  vigencia_directiva: optionalText(300, 'La vigencia de la directiva no puede superar 300 caracteres.'),
  documentos: legalDocumentsSchema,
};

export const registerLegalRecordSchema = z.object(legalRecordFields).strict();

export const updateLegalRecordSchema = registerLegalRecordSchema.extend({
  version_esperada: z.number({ error: 'La versión esperada debe ser numérica.' })
    .int('La versión esperada debe ser un entero mayor que cero.')
    .positive('La versión esperada debe ser un entero mayor que cero.'),
}).strict();

export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];
export type LegalDocumentStatus = typeof LEGAL_DOCUMENT_STATUSES[number];
export type RegisterLegalRecordData = z.infer<typeof registerLegalRecordSchema>;
export type UpdateLegalRecordData = z.infer<typeof updateLegalRecordSchema>;
