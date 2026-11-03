export const TIPOS_IMAGEN_ORGANIZACION = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const TAMANO_MAXIMO_IMAGEN_ORGANIZACION = 5 * 1024 * 1024;
export const IMAGEN_ORGANIZACION_PREDETERMINADA = '/images/organizacion-predeterminada.svg';

const EXTENSIONES: Record<(typeof TIPOS_IMAGEN_ORGANIZACION)[number], readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export function validarImagenOrganizacion(archivo: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const tipo = archivo.type.toLowerCase() as (typeof TIPOS_IMAGEN_ORGANIZACION)[number];
  const extension = archivo.name.split('.').at(-1)?.toLowerCase() ?? '';
  if (!TIPOS_IMAGEN_ORGANIZACION.includes(tipo) || !EXTENSIONES[tipo].includes(extension)) {
    return 'Selecciona una imagen JPG, PNG o WebP.';
  }
  if (archivo.size === 0) return 'La imagen seleccionada está vacía.';
  if (archivo.size > TAMANO_MAXIMO_IMAGEN_ORGANIZACION) return 'La imagen no puede superar 5 MB.';
  return null;
}
