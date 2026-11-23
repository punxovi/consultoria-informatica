import { z } from 'zod';

export const TIPOS_IMAGEN_PRODUCTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TAMANO_MAXIMO_IMAGEN_PRODUCTO = 5 * 1024 * 1024;
export const MAXIMO_IMAGENES_POR_CARGA = 6;

const EXTENSIONES: Record<(typeof TIPOS_IMAGEN_PRODUCTO)[number], readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Usa hasta ${max} caracteres.`)
    .transform((valor) => (valor === '' ? null : valor));

export const formularioProductoSchema = z.object({
  id_organizacion: z.string().trim().pipe(z.uuid('Selecciona la Organización a la que pertenece.')),
  nombre: z.string().trim().min(1, 'Ingresa el nombre del producto.').max(150, 'Usa hasta 150 caracteres.'),
  descripcion: z.string().trim().min(1, 'Ingresa la descripción del producto.').max(2000, 'Usa hasta 2000 caracteres.'),
  unidad_medida: z.string().trim().min(1, 'Ingresa la unidad de medida (ej. unidad, set, caja).').max(50, 'Usa hasta 50 caracteres.'),
  categoria: textoOpcional(80),
  material: textoOpcional(80),
  terminacion: textoOpcional(80),
});
export type EntradaFormularioProducto = z.input<typeof formularioProductoSchema>;
export type DatosProducto = z.output<typeof formularioProductoSchema>;
export const camposFormulario = Object.keys(formularioProductoSchema.shape) as (keyof DatosProducto)[];

const imagenSchema = z.object({
  id_archivo: z.string().min(1),
  nombre_archivo: z.string().nullable().optional(),
  url: z.url().nullable().optional(),
});
export type ImagenProducto = z.infer<typeof imagenSchema>;

export const productoSchema = z.object({
  id_producto: z.string().min(1),
  id_organizacion: z.string().min(1),
  nombre: z.string(),
  descripcion: z.string(),
  unidad_medida: z.string(),
  categoria: z.string().nullable().optional().transform((v) => v ?? null),
  material: z.string().nullable().optional().transform((v) => v ?? null),
  terminacion: z.string().nullable().optional().transform((v) => v ?? null),
  publicado: z.boolean(),
  version: z.number().int().positive(),
  updated_at: z.string(),
  organizacion: z.object({
    id_organizacion: z.string(),
    nombre: z.string(),
    pais: z.object({ id_pais: z.string(), codigo_iso: z.string(), nombre: z.string() }).nullable(),
  }).nullable(),
  imagenes: z.array(imagenSchema).optional().transform((v) => v ?? []),
});
export type Producto = z.infer<typeof productoSchema>;

export function validarImagenProducto(archivo: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const tipo = archivo.type.toLowerCase() as (typeof TIPOS_IMAGEN_PRODUCTO)[number];
  const extension = archivo.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (!TIPOS_IMAGEN_PRODUCTO.includes(tipo) || !EXTENSIONES[tipo].includes(extension)) {
    return `«${archivo.name}» no es una imagen JPG, PNG o WebP.`;
  }
  if (archivo.size === 0) return `«${archivo.name}» está vacía.`;
  if (archivo.size > TAMANO_MAXIMO_IMAGEN_PRODUCTO) return `«${archivo.name}» supera 5 MB.`;
  return null;
}

export function valoresRegistrados(productos: Producto[], campo: 'categoria' | 'material' | 'terminacion'): string[] {
  const valores = new Map<string, string>();
  for (const producto of productos) {
    const valor = producto[campo]?.trim();
    if (valor) valores.set(valor.toLocaleLowerCase('es-CL'), valor);
  }
  return [...valores.values()].sort((a, b) => a.localeCompare(b, 'es-CL'));
}

export function filtrarProductos(productos: Producto[], termino: string, estado: 'todos' | 'publicados' | 'no_publicados'): Producto[] {
  const busqueda = termino.trim().toLocaleLowerCase('es-CL');
  return productos.filter((producto) => {
    if (estado === 'publicados' && !producto.publicado) return false;
    if (estado === 'no_publicados' && producto.publicado) return false;
    if (!busqueda) return true;
    return [producto.nombre, producto.organizacion?.nombre ?? '', producto.organizacion?.pais?.nombre ?? '', producto.categoria ?? '']
      .some((valor) => valor.toLocaleLowerCase('es-CL').includes(busqueda));
  });
}
