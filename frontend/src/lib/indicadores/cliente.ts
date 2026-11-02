import { z } from 'zod';
import { ApiError, type ApiTransport } from '../api/transporte.ts';
import { catalogoSchema, indicadorAccionSchema, resultadoSchema, type ServicioIndicadores, type IndicadorAccion } from './modelo.ts';

export function crearClienteIndicadores(http: ApiTransport, token: () => Promise<string>): ServicioIndicadores {
  const ruta = (accion: string) => `/api/v1/actions/${encodeURIComponent(accion)}/indicators`;
  const invalida = () => new ApiError('RESPUESTA_INVALIDA', 'La respuesta de Indicadores no corresponde al registro solicitado.', 502);
  function registro(valor: unknown, accion: string, id?: string) {
    const r = indicadorAccionSchema.safeParse(valor);
    if (!r.success || r.data.id_accion !== accion || (id && r.data.id_indicador !== id)) throw invalida();
    return r.data;
  }
  function lista(valor: unknown, accion: string): IndicadorAccion[] {
    if (!Array.isArray(valor)) throw invalida();
    const registros = valor.map(v => registro(v, accion));
    if (new Set(registros.map(r => r.id_indicador)).size !== registros.length ||
      new Set(registros.filter(r => r.id_catalogo !== null).map(r => r.id_catalogo)).size !== registros.filter(r => r.id_catalogo !== null).length) throw invalida();
    return registros;
  }
  return {
    async catalogo() {
      const r = await http.request<{ catalogo: unknown }>('/api/v1/indicators/catalog', { accessToken: await token() });
      const datos = z.array(catalogoSchema).safeParse(r.data?.catalogo);
      if (!datos.success || new Set(datos.data.map(i => i.codigo)).size !== datos.data.length || new Set(datos.data.map(i => i.id_indicador)).size !== datos.data.length) throw invalida();
      return datos.data;
    },
    async listar(accion) {
      const r = await http.request<{ indicadores: unknown }>(ruta(accion), { accessToken: await token() });
      return lista(r.data?.indicadores, accion);
    },
    async asociar(accion, entradas) {
      const r = await http.request<{ indicadores: unknown }>(ruta(accion), { method: 'POST', body: { indicadores: entradas }, accessToken: await token() });
      const registros = lista(r.data?.indicadores, accion);
      if (registros.length !== entradas.length || entradas.some(e => !registros.some(i => i.id_catalogo === e.id_indicador))) throw invalida();
      return registros;
    },
    async actualizarMeta(item, meta) {
      const r = await http.request<{ indicador: unknown }>(`/api/v1/indicators/${encodeURIComponent(item.id_indicador)}`, {
        method: 'PATCH', accessToken: await token(), body: { version_esperada: item.version, cambios: { meta } },
      });
      const actualizado = registro(r.data?.indicador, item.id_accion, item.id_indicador);
      if (actualizado.id_catalogo !== item.id_catalogo) throw invalida();
      return actualizado;
    },
    async guardarResultado(item, entrada) {
      const anterior = item.resultado;
      const r = await http.request<{ resultado: unknown }>(anterior ? `/api/v1/results/${encodeURIComponent(anterior.id_resultado)}` : '/api/v1/results', {
        method: anterior ? 'PATCH' : 'POST', accessToken: await token(),
        body: anterior ? { version_esperada: anterior.version, cambios: entrada } : { id_indicador: item.id_indicador, ...entrada },
      });
      const resultado = resultadoSchema.safeParse(r.data?.resultado);
      if (!resultado.success || resultado.data.id_indicador !== item.id_indicador || (anterior && resultado.data.id_resultado !== anterior.id_resultado)) throw invalida();
      return resultado.data;
    },
  };
}
