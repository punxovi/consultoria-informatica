import { z } from 'zod';

export const MAX_BYTES = 52_428_800; // 50 MiB

export const tiposArchivos = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
} as const;

export const accept = '.pdf,.jpg,.jpeg,.png,.webp';

export const TIPOS_RESPALDO = ['comprobante', 'acta_entrega', 'certificado', 'fotografia'] as const;
export type TipoRespaldo = (typeof TIPOS_RESPALDO)[number];

export const etiquetasTipoRespaldo: Record<TipoRespaldo, string> = {
  comprobante: 'Comprobante',
  acta_entrega: 'Acta de entrega',
  certificado: 'Certificado',
  fotografia: 'Fotografía',
};

export function normalizarTipoRespaldo(tipo: string): TipoRespaldo {
  const norm = tipo.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
  if (norm === 'comprobante') return 'comprobante';
  if (norm === 'acta_de_entrega' || norm === 'acta_entrega') return 'acta_entrega';
  if (norm === 'certificado') return 'certificado';
  if (norm === 'fotografia') return 'fotografia';
  throw new Error('El tipo de respaldo debe ser comprobante, acta de entrega, certificado o fotografía.');
}

export function tipoArchivo(file: Pick<File, 'name' | 'type' | 'size'>): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const tipo = Object.entries(tiposArchivos).find(([, extensiones]) =>
    (extensiones as readonly string[]).includes(extension ?? '')
  )?.[0];

  if (!tipo || (file.type && file.type !== tipo)) {
    throw new Error('El formato del archivo debe ser PDF, JPG, PNG o WebP.');
  }
  if (!file.size || file.size <= 0) {
    throw new Error('El archivo seleccionado está vacío.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('El archivo supera el límite de 50 MiB.');
  }
  if (file.name.length > 255) {
    throw new Error('El nombre del archivo no puede superar 255 caracteres.');
  }
  return tipo;
}

export const CATEGORIAS_APORTE = ['Dinero', 'Producto', 'Servicio', 'Insumos', 'Otro'] as const;
export const TIPOS_DONANTE = ['empresa', 'persona', 'organizacion'] as const;
export const ESTADOS_DONACION = ['Comprometida', 'Recibida', 'Entregada', 'Cerrada'] as const;
export type EstadoDonacion = (typeof ESTADOS_DONACION)[number];

export const etiquetasTipoDonante: Record<(typeof TIPOS_DONANTE)[number], string> = {
  empresa: 'Empresa',
  persona: 'Persona',
  organizacion: 'Organización',
};

// Secuencia autorizada: Comprometida → Recibida → Entregada → Cerrada, sin saltos ni retrocesos.
export function siguienteEstado(estado?: string | null): EstadoDonacion | null {
  if (!estado) return 'Comprometida';
  const indice = ESTADOS_DONACION.indexOf(estado as EstadoDonacion);
  return indice >= 0 ? (ESTADOS_DONACION[indice + 1] ?? null) : null;
}

export function esDinero(categoria?: string): boolean {
  return categoria === 'Dinero';
}

const camposDonacion = {
  // El Backend valida catálogos, relaciones y reglas cruzadas de HU20.
  id_pais: z.string().optional(),
  id_programa: z.string().optional(),
  categoria: z.string().optional(),
  categoria_otro: z.string().optional(),
  tipo_donante: z.string().optional(),
  origen: z.string().optional(),
  estado: z.string().optional(),
  valor_estimado: z.number().min(0, 'El valor estimado no puede ser negativo.').optional(),
  moneda_valorizacion: z.string().trim().regex(/^[A-Z]{3}$/, 'La moneda debe ser un código de 3 letras (ej. CLP).').optional(),
  metodo_valorizacion: z.string().trim().min(1, 'Indica el método de valorización.').max(200).optional(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingresa una fecha válida (AAAA-MM-DD).'),
  tipo_movimiento: z.enum(['recibida', 'entregada'], {
    error: 'Selecciona si la donación fue recibida o entregada.',
  }),
  contraparte_nombre: z
    .string()
    .trim()
    .min(1, 'Indica el nombre del donante.')
    .max(200, 'El nombre no puede superar 200 caracteres.'),
  descripcion: z
    .string()
    .trim()
    .min(1, 'Describe la donación.')
    .max(2000, 'La descripción no puede superar 2000 caracteres.'),
  tipo_aporte: z.enum(['dinero', 'recurso'], {
    error: 'Selecciona si el aporte es en dinero o en recursos.',
  }),
  monto: z.number().positive('El monto debe ser mayor a cero.').optional(),
  moneda: z.string().trim().regex(/^[A-Z]{3}$/, 'La moneda debe ser un código de 3 letras (ej. CLP).').optional(),
  cantidad: z.number().positive('La cantidad debe ser mayor a cero.').optional(),
  unidad: z.string().trim().min(1, 'Especifica la unidad de medida (ej. cajas, kg).').max(50).optional(),
};

type CamposDonacion = {
  [K in keyof typeof camposDonacion]: z.infer<(typeof camposDonacion)[K]>;
};

function reglasAporte(d: Partial<CamposDonacion>, ctx: z.RefinementCtx) {
  if (d.tipo_aporte === 'dinero') {
    if (!d.monto || d.monto <= 0) {
      ctx.addIssue({ code: 'custom', path: ['monto'], message: 'El aporte en dinero exige un monto mayor a 0.' });
    }
    if (!d.moneda) {
      ctx.addIssue({ code: 'custom', path: ['moneda'], message: 'Indica la moneda del aporte (ej. CLP).' });
    }
  } else {
    const requiereCantidad = !d.categoria || d.cantidad !== undefined || d.unidad !== undefined;
    if (requiereCantidad && (!d.cantidad || d.cantidad <= 0)) {
      ctx.addIssue({ code: 'custom', path: ['cantidad'], message: 'Indica la cantidad o deja vacíos cantidad y unidad.' });
    }
    if (requiereCantidad && !d.unidad) {
      ctx.addIssue({ code: 'custom', path: ['unidad'], message: 'Indica la unidad de medida (ej. cajas).' });
    }
  }
  if (d.categoria === 'Otro' && !d.categoria_otro?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['categoria_otro'], message: 'Describe el aporte cuando la categoría es Otro.' });
  }
  if (d.categoria && d.categoria !== 'Otro' && d.categoria_otro) {
    ctx.addIssue({ code: 'custom', path: ['categoria_otro'], message: 'Este texto solo se usa con la categoría Otro.' });
  }
  const valorizacion = [d.valor_estimado, d.moneda_valorizacion, d.metodo_valorizacion];
  const informados = valorizacion.filter((valor) => valor !== undefined).length;
  if (informados > 0 && informados < 3) {
    const faltantes: [keyof CamposDonacion, unknown][] = [
      ['valor_estimado', d.valor_estimado],
      ['moneda_valorizacion', d.moneda_valorizacion],
      ['metodo_valorizacion', d.metodo_valorizacion],
    ];
    for (const [campo, valor] of faltantes) {
      if (valor === undefined) {
        ctx.addIssue({ code: 'custom', path: [campo], message: 'Completa valor, moneda y método de valorización, o deja los tres vacíos.' });
      }
    }
  }
}

export const donacionFormSchema = z.object(camposDonacion).superRefine(reglasAporte);

// Registro desde la interfaz: HU20 exige estos campos además de los comunes.
export const donacionRegistroSchema = z
  .object({
    ...camposDonacion,
    id_pais: z.string().min(1, 'No se pudo determinar el país de la organización.'),
    categoria: z.enum(CATEGORIAS_APORTE, { error: 'Selecciona la categoría del aporte.' }),
    tipo_donante: z.enum(TIPOS_DONANTE, { error: 'Selecciona el tipo de donante.' }),
    origen: z.string().trim().min(1, 'Indica el origen del donante.').max(2000),
    estado: z.enum(ESTADOS_DONACION, { error: 'Selecciona el estado del aporte.' }),
  })
  .superRefine(reglasAporte);

export type DatosDonacionForm = z.infer<typeof donacionFormSchema>;
export type DatosDonacionRegistro = z.infer<typeof donacionRegistroSchema>;

export type ErrorRegistro = { path: PropertyKey[]; message: string };

// Zod omite las reglas cruzadas si fallan campos simples; se evalúan igualmente
// para mostrar al usuario todos los errores del formulario en un solo intento.
export function validarRegistroDonacion(
  raw: unknown,
): { success: true; data: DatosDonacionRegistro } | { success: false; issues: ErrorRegistro[] } {
  const resultado = donacionRegistroSchema.safeParse(raw);
  if (resultado.success) return { success: true, data: resultado.data };
  const issues: ErrorRegistro[] = resultado.error.issues.map(({ path, message }) => ({ path, message }));
  const cruzados: ErrorRegistro[] = [];
  reglasAporte((raw ?? {}) as Partial<CamposDonacion>, {
    addIssue: (issue: { path?: PropertyKey[]; message?: string }) =>
      cruzados.push({ path: issue.path ?? [], message: issue.message ?? '' }),
  } as z.RefinementCtx);
  for (const issue of cruzados) {
    if (!issues.some((existente) => existente.path[0] === issue.path[0])) issues.push(issue);
  }
  return { success: false, issues };
}


export const respaldoFormSchema = z.object({
  tipo_respaldo: z.enum(TIPOS_RESPALDO, {
    error: 'Selecciona un tipo de respaldo válido (comprobante, acta de entrega, certificado o fotografía).',
  }),
  descripcion: z.string().trim().max(2000).optional(),
});

export type DatosRespaldoForm = z.infer<typeof respaldoFormSchema>;

export const donacionSchema = z.object({
  id_donacion: z.string().uuid(),
  id_organizacion: z.string().uuid(),
  id_pais: z.string().uuid().optional(),
  id_programa: z.string().uuid().nullable().optional(),
  categoria: z.string().nullable().optional(),
  categoria_otro: z.string().nullable().optional(),
  tipo_donante: z.string().nullable().optional(),
  origen: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  valor_estimado: z.number().nullable().optional(),
  moneda_valorizacion: z.string().nullable().optional(),
  metodo_valorizacion: z.string().nullable().optional(),
  fecha: z.string(),
  tipo_movimiento: z.enum(['recibida', 'entregada']),
  contraparte_nombre: z.string(),
  descripcion: z.string(),
  tipo_aporte: z.enum(['dinero', 'recurso']),
  cantidad: z.number().nullable().optional(),
  unidad: z.string().nullable().optional(),
  monto: z.number().nullable().optional(),
  moneda: z.string().nullable().optional(),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Donacion = z.infer<typeof donacionSchema>;

export const respaldoSchema = z.object({
  id_archivo: z.string().uuid(),
  id_donacion: z.string().uuid(),
  bucket_id: z.string(),
  ruta_objeto: z.string(),
  nombre_original: z.string(),
  mime_type: z.string(),
  tamano_bytes: z.number().int().positive(),
  categoria: z.string(),
  tipo_respaldo: z.enum(TIPOS_RESPALDO),
  descripcion: z.string().nullable().optional(),
  estado_carga: z.enum(['reservado', 'disponible', 'fallido']),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type RespaldoDonacion = z.infer<typeof respaldoSchema>;

export type ReservaRespaldo = {
  id_donacion?: string;
  tipo_respaldo: TipoRespaldo;
  descripcion?: string;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
};
