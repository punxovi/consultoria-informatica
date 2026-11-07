import { z } from 'zod';
import { ApiError, createApiTransport } from '../api/transporte.ts';
import { productoSchema, type DatosProducto, type ImagenProducto, type Producto } from './modelo.ts';

const ruta = (id?: string) => `/api/v1/products${id ? `/${encodeURIComponent(id)}` : ''}`;

function respuestaInvalida(): ApiError {
  return new ApiError('RESPUESTA_INVALIDA', 'El servicio devolvió datos de productos inválidos.', 502);
}

function leerProducto(valor: unknown): Producto {
  const resultado = productoSchema.safeParse(valor);
  if (!resultado.success) throw respuestaInvalida();
  return resultado.data;
}

export function crearClienteProductos(baseUrl: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
  const http = createApiTransport(baseUrl, fetchImpl);

  async function actualizar(producto: Pick<Producto, 'id_producto' | 'version'>, cambios: Partial<DatosProducto> & { publicado?: boolean }) {
    if (Object.keys(cambios).length === 0) throw new Error('Debes indicar al menos un cambio.');
    const respuesta = await http.request<{ product: unknown }>(ruta(producto.id_producto), {
      method: 'PATCH',
      body: { version_esperada: producto.version, cambios },
      accessToken: await token(),
    });
    return leerProducto(respuesta.data?.product);
  }

  return {
    async listar(): Promise<Producto[]> {
      const respuesta = await http.request<{ products: unknown }>(ruta(), { accessToken: await token() });
      if (!Array.isArray(respuesta.data?.products)) throw respuestaInvalida();
      return respuesta.data.products.map(leerProducto);
    },

    async crear(datos: DatosProducto): Promise<Producto> {
      // Todo producto nuevo nace sin publicar; publicarlo es una acción confirmada aparte.
      const respuesta = await http.request<{ product: unknown }>(ruta(), {
        method: 'POST',
        body: { ...datos, publicado: false },
        accessToken: await token(),
      });
      return leerProducto(respuesta.data?.product);
    },

    actualizar,

    cambiarPublicacion(producto: Pick<Producto, 'id_producto' | 'version'>, publicado: boolean): Promise<Producto> {
      return actualizar(producto, { publicado });
    },

    async subirImagenes(idProducto: string, archivos: File[]): Promise<ImagenProducto[]> {
      const formulario = new FormData();
      for (const archivo of archivos) formulario.append('imagenes', archivo, archivo.name);
      const respuesta = await http.request<{ imagenes: unknown }>(`${ruta(idProducto)}/images`, {
        method: 'POST',
        body: formulario,
        accessToken: await token(),
      });
      const imagenes = z.array(z.looseObject({ id_archivo: z.string().min(1) })).safeParse(respuesta.data?.imagenes);
      if (!imagenes.success) throw new ApiError('RESPUESTA_INVALIDA', 'No se pudo confirmar la carga de las imágenes.', 502);
      return imagenes.data as ImagenProducto[];
    },
  };
}

export type ClienteProductos = ReturnType<typeof crearClienteProductos>;

export function mensajeErrorProductos(error: unknown, accion: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'RUTA_NO_ENCONTRADA') return 'El servicio de productos de cotización todavía no está disponible.';
    if (error.code === 'RESPUESTA_INVALIDA') return error.message;
    if (error.status === 401) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'Solo el Administrador puede gestionar los productos de cotización.';
    if (error.status === 404) return 'El producto no existe o ya no está disponible.';
    if (error.status === 409) return 'El producto cambió en otra sesión. Recarga la página antes de volver a intentarlo.';
    if (error.status === 413) return 'Las imágenes superan el tamaño permitido.';
    if (error.status === 0 || error.status >= 500) return `No fue posible ${accion}. Revisa tu conexión e inténtalo nuevamente.`;
    return error.message || `No fue posible ${accion}.`;
  }
  return `No fue posible ${accion}. Inténtalo nuevamente.`;
}
