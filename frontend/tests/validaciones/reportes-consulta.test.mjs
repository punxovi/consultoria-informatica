// Pruebas del manejo de estados de la consulta de reportes con respuestas SIMULADAS:
// no se llama al Backend; cada promesa representa lo que devolvería cliente.preparar().
// Los documentos se generan con la función real del Backend (tests/helpers/reporte-contrato.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/api/transporte.ts';
import { crearControladorConsulta, describirErrorConsulta, reporteSinResultados } from '../../src/lib/reportes/consulta.ts';
import { consolidadoConDatos, resumenConDatos, respuestaSimulada } from '../helpers/reporte-contrato.mjs';

const parametros = { fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno' };
const conDatos = respuestaSimulada(parametros, consolidadoConDatos, resumenConDatos);
const sinFilas = respuestaSimulada(parametros);

function diferida() {
  let resolver, rechazar;
  const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej; });
  return { promesa, resolver, rechazar };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function controlador() {
  const historial = [];
  const c = crearControladorConsulta((estado) => historial.push(estado.tipo));
  return { c, historial };
}

test('reporteSinResultados: secciones vacías o agregados en cero son ausencia de resultados', () => {
  assert.equal(reporteSinResultados(sinFilas), true);
  assert.equal(reporteSinResultados(conDatos), false);
  const donante = { ...parametros, destino: 'donante' };
  assert.equal(reporteSinResultados(respuestaSimulada(donante)), true, 'agregados en cero');
  assert.equal(reporteSinResultados(respuestaSimulada(donante, consolidadoConDatos, resumenConDatos)), false);
  // Una fila con texto cuenta como dato aunque su número sea 0.
  const organizacionSinBeneficiarios = respuestaSimulada(parametros, { organizations: [{ nombre: 'Comedor', pais: 'Chile', numero_beneficiarios: 0 }] });
  assert.equal(reporteSinResultados(organizacionSinBeneficiarios), false);
});

test('transición: preparada → carga → éxito con respuesta simulada con datos', async () => {
  const { c, historial } = controlador();
  assert.equal(c.estado.tipo, 'inactivo');
  const responder = c.preparar(parametros);
  assert.equal(c.estado.tipo, 'preparada');
  const respuesta = diferida();
  responder(respuesta.promesa);
  assert.equal(c.estado.tipo, 'carga');
  assert.deepEqual(c.estado.parametros, parametros);
  respuesta.resolver(conDatos);
  await tick();
  assert.equal(c.estado.tipo, 'exito');
  assert.equal(c.estado.vista, conDatos);
  assert.deepEqual(historial, ['preparada', 'carga', 'exito']);
});

test('transición: carga → ausencia de resultados con respuesta simulada vacía', async () => {
  const { c } = controlador();
  c.preparar(parametros)(Promise.resolve(sinFilas));
  await tick();
  assert.equal(c.estado.tipo, 'vacio');
  assert.equal(c.estado.vista, sinFilas, 'conserva la vista para mostrar las secciones vacías');
});

test('transición: carga → error; distingue errores reintentables de los que no lo son', async () => {
  const casos = [
    [new ApiError('SERVICIO_NO_DISPONIBLE', 'x', 0), true, /conexión/],
    [new ApiError('ERROR_INTERNO', 'x', 503), true, /conexión/],
    [new ApiError('SESION', 'x', 401), false, /sesión expiró/],
    [new ApiError('PROHIBIDO', 'x', 403), false, /permiso/],
    [new ApiError('DATOS_INVALIDOS', 'El rango de fechas no es válido.', 400), false, /rango de fechas/],
    [new Error('fallo inesperado'), true, /Inténtalo nuevamente/],
  ];
  for (const [error, reintentable, mensaje] of casos) {
    const { c } = controlador();
    c.preparar(parametros)(Promise.reject(error));
    await tick();
    assert.equal(c.estado.tipo, 'error', error.message);
    assert.equal(c.estado.reintentable, reintentable, `${error.message} reintentable`);
    assert.match(c.estado.mensaje, mensaje);
    assert.deepEqual(c.estado.parametros, parametros, 'conserva los parámetros para reintentar');
  }
});

test('una respuesta sin documento válido se informa como error', async () => {
  const { c } = controlador();
  c.preparar(parametros)(Promise.resolve({ title: 'incompleto' }));
  await tick();
  assert.equal(c.estado.tipo, 'error');
  assert.equal(c.estado.reintentable, true);
});

test('una respuesta de otro período o con otros filtros no se presenta como válida', async () => {
  const otroPeriodo = respuestaSimulada({ ...parametros, fecha_inicio: '2025-01-01' }, consolidadoConDatos, resumenConDatos);
  const otroPais = respuestaSimulada({ ...parametros, id_pais: '13700000-0000-4000-8000-000000000009' }, consolidadoConDatos, resumenConDatos);
  for (const [vista, motivo] of [[otroPeriodo, /período/], [otroPais, /País/]]) {
    const { c } = controlador();
    c.preparar(parametros)(Promise.resolve(vista));
    await tick();
    assert.equal(c.estado.tipo, 'error');
    assert.match(c.estado.mensaje, /no corresponde a los criterios solicitados/);
    assert.match(c.estado.mensaje, motivo);
    assert.equal(c.estado.reintentable, true);
  }
});

test('modificar criterios durante la carga descarta la respuesta tardía', async () => {
  const { c } = controlador();
  const respuesta = diferida();
  c.preparar(parametros)(respuesta.promesa);
  assert.equal(c.estado.tipo, 'carga');
  c.reiniciar();
  respuesta.resolver(conDatos);
  await tick();
  assert.equal(c.estado.tipo, 'inactivo');
});

test('una solicitud nueva invalida el responder y el error de la anterior', async () => {
  const { c } = controlador();
  const primera = diferida();
  const responderPrimera = c.preparar(parametros);
  responderPrimera(primera.promesa);
  const segunda = { ...parametros, fecha_inicio: '2026-06-01' };
  const responderSegunda = c.preparar(segunda);
  responderPrimera(Promise.resolve(conDatos)); // ya no corresponde: se ignora
  assert.equal(c.estado.tipo, 'preparada');
  responderSegunda(Promise.resolve(respuestaSimulada(segunda)));
  primera.rechazar(new ApiError('ERROR_INTERNO', 'x', 503));
  await tick();
  assert.equal(c.estado.tipo, 'vacio');
  assert.deepEqual(c.estado.parametros, segunda);
});

test('el responder se usa una sola vez', async () => {
  const { c, historial } = controlador();
  const responder = c.preparar(parametros);
  responder(Promise.resolve(conDatos));
  responder(Promise.resolve(sinFilas));
  await tick();
  assert.equal(c.estado.tipo, 'exito');
  assert.deepEqual(historial, ['preparada', 'carga', 'exito']);
});

test('describirErrorConsulta: el 400 usa el mensaje del Backend', () => {
  assert.equal(describirErrorConsulta(new ApiError('DATOS_INVALIDOS', 'Filtro desconocido.', 400)).mensaje, 'Filtro desconocido.');
});
