import { z } from 'zod';
import { readSupabaseConnection } from '../../../../shared/config/src/supabase.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { publicProductSchema, productPageSchema, type ProductsRepository } from '../domain/products.ts';
interface Options { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }
export function createSupabaseProductsRepository(options: Options): ProductsRepository {
  return { async execute(token, operation, data, publicQuery = false) {
    if (!options.supabaseUrl || !options.anonKey) throw new ServiceError('CONFIGURACION_SUPABASE', 'Falta configurar la conexión del Backend con Supabase.', 503);
    if (!publicQuery && !token) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión.', 401);
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(`${options.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${publicQuery ? 'consultar_productos_publicos' : 'administrar_productos_cotizacion'}`, {
        method: 'POST', headers: { apikey: options.anonKey, ...(!publicQuery ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
        body: JSON.stringify({ p_operacion: operation, p_datos: data }), signal: AbortSignal.timeout(10000),
      });
    } catch { throw new ServiceError('PRODUCTOS_NO_DISPONIBLES', 'No fue posible conectar con el catálogo.', 503); }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) throw new ServiceError(publicQuery ? 'CONFIGURACION_SUPABASE' : 'SESION_INVALIDA', publicQuery ? 'La conexión del catálogo público no está disponible.' : 'La sesión no es válida o ha expirado.', publicQuery ? 503 : 401);
      const errors: Record<string, [string, string, number]> = {
        '42501': ['SIN_PERMISO', 'Solo un Administrador activo puede administrar productos.', 403],
        P0162: ['PRODUCTO_NO_ENCONTRADO', 'El producto no existe o no está disponible.', 404],
        P0163: ['ORGANIZACION_NO_ENCONTRADA', 'La Organización no existe.', 404],
        P0164: ['ORGANIZACION_INACTIVA', 'La Organización o su país no están activos.', 409],
        P0165: ['FILTRO_NO_ENCONTRADO', 'El país o la Organización del filtro no están disponibles.', 404],
        '40001': ['CONFLICTO_VERSION', 'El producto cambió. Recarga antes de reintentar.', 409],
        '22023': ['DATOS_INVALIDOS', 'Revisa los campos y filtros del producto.', 400],
        '23514': ['DATOS_INVALIDOS', 'Los datos no cumplen las restricciones del producto.', 400],
        '23502': ['DATOS_INVALIDOS', 'Faltan campos obligatorios.', 400],
        '22P02': ['DATOS_INVALIDOS', 'El formato de los datos no es válido.', 400],
        PGRST202: ['MIGRACION_PRODUCTOS_PENDIENTE', 'Falta aplicar la migración de operaciones de productos.', 503],
        '42883': ['MIGRACION_PRODUCTOS_PENDIENTE', 'Falta aplicar la migración de operaciones de productos.', 503],
      };
      const error = errors[body?.code];
      if (error) throw new ServiceError(...error);
      throw new ServiceError('PRODUCTOS_NO_DISPONIBLES', 'No fue posible completar la operación del catálogo.', response.status === 429 ? 429 : 503);
    }
    const adminProduct = z.object({ id_producto: z.uuid(), id_organizacion: z.uuid(), nombre: z.string(), version: z.number().int().positive(), publicado: z.boolean() }).passthrough();
    const schema = operation === 'authorize' ? z.object({ authorized: z.literal(true) })
      : operation === 'list' ? productPageSchema(publicQuery ? publicProductSchema : adminProduct)
      : publicQuery ? publicProductSchema : adminProduct;
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ServiceError('RESPUESTA_INVALIDA', 'El servicio devolvió un contrato de productos inválido.', 502);
    return parsed.data;
  } };
}
export const createSupabaseProductsRepositoryFromEnv = () => createSupabaseProductsRepository(readSupabaseConnection());
