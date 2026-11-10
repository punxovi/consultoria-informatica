import { getSupabaseClient } from '../supabase';
import { paisOperativo } from '../territorio/contexto';
import { crearClienteSolicitudes } from './cliente';

export function iniciarContadorCotizaciones() {
  const indicador = document.getElementById('cotizaciones-nuevas');
  if (!indicador || indicador.dataset.iniciado) return;
  indicador.dataset.iniciado = 'true';
  const cliente = crearClienteSolicitudes(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session) throw new Error('Sesión requerida');
    return data.session.access_token;
  });
  let consulta = 0;
  async function actualizar() {
    if (!indicador || document.hidden) return;
    const turno = ++consulta;
    try {
      const pais = await paisOperativo();
      const solicitudes = pais ? await cliente.listar() : [];
      if (turno !== consulta) return;
      const cantidad = solicitudes.filter(s => s.estado === 'solicitada' &&
        s.items.some(item => item.organizacion.pais.id_pais === pais)).length;
      indicador.textContent = String(cantidad);
      indicador.setAttribute('aria-label', cantidad + ' solicitudes nuevas');
      indicador.hidden = cantidad === 0;
    } catch {
      if (turno === consulta) indicador.hidden = true;
    }
  }
  void actualizar();
  window.addEventListener('fge:cotizaciones-actualizadas', actualizar);
  window.addEventListener('fge:territorio-cambiado', actualizar);
  document.addEventListener('visibilitychange', actualizar);
  window.setInterval(actualizar, 60000);
}
