import { getSupabaseClient } from '../supabase';
import { crearClienteInvitados } from './cliente';

export function iniciarContadorInvitados() {
  const indicador = document.getElementById('invitados-pendientes');
  if (!indicador || indicador.dataset.iniciado) return;
  indicador.dataset.iniciado = 'true';
  const cliente = crearClienteInvitados(import.meta.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000', async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data.session) throw new Error('Sesión requerida');
    return data.session.access_token;
  });
  let consulta = 0;
  async function actualizar() {
    if (!indicador || document.hidden) return;
    const turno = ++consulta;
    try {
      const solicitudes = await cliente.listar();
      if (turno !== consulta) return;
      const cantidad = solicitudes.filter(s => s.estado === 'pendiente').length;
      indicador.textContent = String(cantidad);
      indicador.setAttribute('aria-label', `${cantidad} ${cantidad === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}`);
      indicador.hidden = cantidad === 0;
    } catch {
      if (turno === consulta) indicador.hidden = true;
    }
  }
  void actualizar();
  window.addEventListener('fge:invitados-actualizados', actualizar);
  document.addEventListener('visibilitychange', actualizar);
  window.setInterval(actualizar, 60000);
}
