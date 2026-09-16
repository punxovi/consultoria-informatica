import { recibirDatosPrueba } from './prueba/recibir-datos.action';
import {
  actualizarOrganizacionAction,
  crearOrganizacionAction,
  listarOrganizacionesAction,
  obtenerOrganizacionPorIdAction,
} from './organizaciones/organizaciones.action';

/**
 * Registro público de Astro Actions.
 *
 * Toda Action nueva debe implementarse en una carpeta de dominio y exponerse
 * desde este objeto para que Astro genere el cliente tipado correspondiente.
 */
export const server = {
  actualizarOrganizacion: actualizarOrganizacionAction,
  crearOrganizacion: crearOrganizacionAction,
  listarOrganizaciones: listarOrganizacionesAction,
  obtenerOrganizacionPorId: obtenerOrganizacionPorIdAction,
  recibirDatosPrueba,
};
