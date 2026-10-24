// Pruebas del manejo de estados de la consulta de reportes con respuestas SIMULADAS:
// no se llama al Backend; cada promesa representa lo que devolvería cliente.preparar().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/api/transporte.ts';
import { crearControladorConsulta, describirErrorConsulta, reporteSinResultados } from '../../src/lib/reportes/consulta.ts';

const parametros = { fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno' };

function vistaSimulada(sections, destination = 'interno') {
  return {
    destination,
    title: 'Reporte Consolidado Institucional',
    document: {
      title: 'Reporte consolidado de intervenciones', destination, generatedAt: '2026-10-24T12:00:00.000Z',
      period: { start: '2026-01-01', end: '2026-12-31' }, filters: [], summary: [{ label: 'Beneficiarios', value: '120' }], sections,
    },
    download: { id: 'x', url: '/api/v1/reports/x/pdf', fileName: 'reporte.pdf', mimeType: 'application/pdf', expiresAt: '2026-10-24T12:05:00.000Z' },
  };
}
const conDatos = vistaSimulada([{ key: 'organizations', title: 'Organizaciones', columns: ['Organización', 'País', 'Beneficiarios'], rows: [['Comedor', 'Chile', '120']] }]);
const sinFilas = vistaSimulada([{ key: 'organizations', title: 'Organizaciones', columns: ['Organización'], rows: [] }, { key: 'plans', title: 'Planes', columns: ['Plan'], rows: [] }]);

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
  const agregadoCero = vistaSimulada([{ key: 'organizations', title: 'Org', columns: ['Medida', 'Valor'], rows: [['Organizaciones', '0'], ['Beneficiarios', '0']] }], 'donante');
  const agregadoConDatos = vistaSimulada([{ key: 'organizations', title: 'Org', columns: ['Medida', 'Valor'], rows: [['Organizaciones', '0'], ['Beneficiarios', '35']] }], 'donante');
  assert.equal(reporteSinResultados(agregadoCero), true);
  assert.equal(reporteSinResultados(agregadoConDatos), false);
  // Una fila con texto (no un cero) cuenta como dato aunque el número sea 0.
  assert.equal(reporteSinResultados(vistaSimulada([{ key: 'organizations', title: 'Org', columns: ['Organización', 'País', 'Beneficiarios'], rows: [['Comedor', 'Chile', '0']] }])), false);
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
  responderSegunda(Promise.resolve(sinFilas));
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
