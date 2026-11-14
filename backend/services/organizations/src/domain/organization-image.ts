import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { assertFileSignature } from './donations.ts';

export const ORGANIZATION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ORGANIZATION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type OrganizationImageMimeType = typeof ORGANIZATION_IMAGE_MIME_TYPES[number];

export const ORGANIZATION_IMAGE_EXTENSIONS: Record<OrganizationImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface OrganizationImage {
  id_archivo: string;
  nombre_original: string;
  mime_type: OrganizationImageMimeType;
  tamano_bytes: number;
  updated_at: string;
}

export interface OrganizationImageUpload {
  bytes: Buffer;
  mimeType: OrganizationImageMimeType;
  nombre: string;
}

function invalidImage(message: string): never {
  throw new ServiceError('IMAGEN_INVALIDA', message, 400);
}

export function parseOrganizationImageMimeType(value: unknown): OrganizationImageMimeType {
  const mimeType = typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '';
  if (!ORGANIZATION_IMAGE_MIME_TYPES.includes(mimeType as OrganizationImageMimeType)) {
    return invalidImage('La imagen debe ser JPG, PNG o WebP.');
  }
  return mimeType as OrganizationImageMimeType;
}

export function parseOrganizationImageUpload(
  bytes: Buffer,
  mimeType: OrganizationImageMimeType,
  nombre: string | null,
): OrganizationImageUpload {
  if (bytes.length === 0) return invalidImage('La imagen está vacía.');
  if (bytes.length > ORGANIZATION_IMAGE_MAX_BYTES) return invalidImage('La imagen no puede superar 5 MB.');
  try {
    assertFileSignature(bytes, mimeType);
  } catch {
    return invalidImage('El contenido del archivo no corresponde a una imagen JPG, PNG o WebP.');
  }
  const limpio = (nombre ?? '').replace(/[\\/]/g, '').trim().slice(0, 255);
  return { bytes, mimeType, nombre: limpio || `imagen.${ORGANIZATION_IMAGE_EXTENSIONS[mimeType]}` };
}
