import { recibirDatosPrueba } from './prueba/recibir-datos.action';
import { archivarPlanAction, archivarAccionAction } from './archivo.action';
import {
  actualizarOrganizacionAction,
  crearOrganizacionAction,
  listarOrganizacionesAction,
  obtenerOrganizacionPorIdAction,
} from './organizaciones/organizaciones.action';
import { authActions } from './auth/auth.action';
import {
  actualizarProgramaAction,
  archivarProgramaAction,
  crearProgramaAction,
  listarProgramasAction,
  obtenerProgramaPorIdAction,
} from './programas/programas.action';
import {
  actualizarPlanAction,
  crearPlanAction,
  listarPlanesAction,
  listarOrganizacionesParaPlanAction,
  obtenerPlanPorIdAction,
} from './planes/planes.action';
import {
  actualizarAccionAction,
  crearAccionAction,
  listarAccionesAction,
  obtenerAccionPorIdAction,
} from './acciones/acciones.action';
/**
 * Registro público de Astro Actions.
 *
 * Toda Action nueva debe implementarse en una carpeta de dominio y exponerse
 * desde este objeto para que Astro genere el cliente tipado correspondiente.
 */
export const server = {
  archivarPlan: archivarPlanAction,
  archivarAccion: archivarAccionAction,
  actualizarAccion: actualizarAccionAction,
  actualizarOrganizacion: actualizarOrganizacionAction,
  crearAccion: crearAccionAction,
  crearOrganizacion: crearOrganizacionAction,
  listarAcciones: listarAccionesAction,
  listarOrganizaciones: listarOrganizacionesAction,
  obtenerAccionPorId: obtenerAccionPorIdAction,
  obtenerOrganizacionPorId: obtenerOrganizacionPorIdAction,
  actualizarPrograma: actualizarProgramaAction,
  archivarPrograma: archivarProgramaAction,
  crearPrograma: crearProgramaAction,
  listarProgramas: listarProgramasAction,
  obtenerProgramaPorId: obtenerProgramaPorIdAction,
  actualizarPlan: actualizarPlanAction,
  crearPlan: crearPlanAction,
  listarPlanes: listarPlanesAction,
  listarOrganizacionesParaPlan: listarOrganizacionesParaPlanAction,
  obtenerPlanPorId: obtenerPlanPorIdAction,
  recibirDatosPrueba,
  solicitarRecuperacion: authActions.solicitarRecuperacion,
  cambiarContrasena: authActions.cambiarContrasena,
  login: authActions.login,
};
