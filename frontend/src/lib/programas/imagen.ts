import { clienteProgramas } from './cliente';

export async function optimizarImagen(archivo: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.');
  if (archivo.size > 10 * 1024 * 1024) throw new Error('La imagen no puede superar 10 MB.');
  const bitmap = await createImageBitmap(archivo).catch(() => { throw new Error('No se pudo leer la imagen. Selecciona otro archivo.'); });
  try {
    const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('El navegador no permite optimizar esta imagen.');
    for (let intento = 0; intento < 8; intento++) {
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', Math.max(0.45, 0.85 - intento * 0.08)));
      if (!blob || blob.type !== 'image/webp') throw new Error('El navegador no admite conversión a WebP.');
      if (blob.size < 600000) return blob;
      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
    }
    throw new Error('No se pudo reducir la imagen a menos de 600 KB. Selecciona otra imagen.');
  } finally { bitmap.close(); }
}

export async function obtenerImagen(idPrograma: string) {
  const { data, error } = await clienteProgramas.from('archivos').select('ruta_objeto').eq('id_programa', idPrograma).eq('categoria', 'imagen_programa').eq('estado_carga', 'disponible').is('archived_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('No se pudo consultar la imagen actual.');
  if (!data) return null;
  const { data: enlace, error: errorEnlace } = await clienteProgramas.storage.from('fge-archivos').createSignedUrl(data.ruta_objeto, 300);
  if (errorEnlace) throw new Error('No se pudo cargar la imagen actual.');
  return enlace.signedUrl;
}

/** Archiva todas las imágenes activas para que no reaparezca una versión anterior. */
export async function quitarImagen(idPrograma: string) {
  const { data, error } = await clienteProgramas.from('archivos')
    .update({ archived_at: new Date().toISOString() })
    .eq('id_programa', idPrograma)
    .eq('categoria', 'imagen_programa')
    .is('archived_at', null)
    .select('id_archivo');
  if (error || !data?.length) {
    throw new Error('El programa está guardado, pero no se pudo quitar la imagen. Revisa tus permisos o recarga el formulario antes de reintentar.');
  }
}

/** Conserva las imágenes anteriores como historial, sin eliminaciones físicas. */
export async function guardarImagen(idPrograma: string, imagen: Blob, nombre: string) {
  const ruta = `programas/${idPrograma}/${crypto.randomUUID()}.webp`;
  const bucket = clienteProgramas.storage.from('fge-archivos');
  const { error: subida } = await bucket.upload(ruta, imagen, { contentType: 'image/webp', upsert: false });
  if (subida) throw new Error('El programa está guardado, pero la imagen no se pudo subir. Puedes reintentar guardarla.');
  const { error } = await clienteProgramas.from('archivos').insert({ id_programa: idPrograma, bucket_id: 'fge-archivos', ruta_objeto: ruta, nombre_original: nombre, mime_type: 'image/webp', tamano_bytes: imagen.size, categoria: 'imagen_programa', estado_carga: 'disponible' });
  if (error) {
    await bucket.remove([ruta]);
    throw new Error('El programa está guardado, pero no se pudo registrar la imagen. Puedes reintentar guardarla.');
  }
}
