// Comparte el entorno de Intervenciones: HTTP real, Postgres embebido y Auth simulado.
import { crearEntornoEvidencias } from './evidencias-entorno.mjs';
import { catalogoDemo } from './indicadores-fixtures.mjs';
export async function crearEntornoIndicadores({origin='http://127.0.0.1:4336'}={}) {
  const env = await crearEntornoEvidencias({origin, indicadores:true});
  try {
    for (const cat of catalogoDemo) await env.como('qa-admin', tx => tx.query(
      'INSERT INTO public.indicadores(id_indicador,nombre,descripcion,unidad_medida) VALUES($1,$2,$3,$4)',
      [cat.id_indicador,cat.nombre,cat.descripcion,cat.unidad_medida]));
    return env;
  } catch(error) { await env.cerrar(); throw error; }
}
