import { recibirDatosPrueba } from './prueba/recibir-datos.action';

/**
 * Registro público de Astro Actions.
 *
 * Toda Action nueva debe implementarse en una carpeta de dominio y exponerse
 * desde este objeto para que Astro genere el cliente tipado correspondiente.
 */
export const server = {
  recibirDatosPrueba,
};
