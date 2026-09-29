import assert from 'node:assert/strict';
import { it } from 'node:test';
import { manejarListarProgramas, manejarObtenerProgramaPorId, manejarCrearPrograma, manejarActualizarPrograma, crearRespuestaErrorPrograma } from '../../src/actions/programas/programas.handler.ts';
import { ErrorOperacionPrograma } from '../../src/lib/server/programas.ts';
import { ErrorOperacionLineaAccionPrograma } from '../../src/lib/server/programa-lineas-accion.ts';
import { mensajeRestriccionPrograma } from '../../src/lib/server/programas-completos.ts';

const programa = { id_programa: '17100000-0000-4000-8000-000000000001', nombre: 'Programa', version: 1 };
const lineas = [{ linea_accion: 'Formación', resultado_esperado: 'Equipos capacitados' }];
const operaciones = {
  listarProgramas: async () => [programa], obtenerProgramaPorId: async () => programa,
  listarLineas: async () => lineas,
};

it('listado y detalle adjuntan las líneas consultadas por programa', async () => {
  const lista = await manejarListarProgramas({}, operaciones);
  assert.equal(lista.codigo, 'PROGRAMAS_LISTADOS');
  assert.deepEqual(lista.datos, [{ ...programa, lineas_accion: lineas }]);
  const detalle = await manejarObtenerProgramaPorId({}, { id_programa: programa.id_programa }, operaciones);
  assert.equal(detalle.codigo, 'PROGRAMA_OBTENIDO');
  assert.deepEqual(detalle.datos.lineas_accion, lineas);
  assert.deepEqual((await manejarListarProgramas({}, { ...operaciones, listarProgramas: async () => [] })).datos, []);
});

it('creación y edición delegan el guardado completo y la versión en una operación', async () => {
  const cliente = {};
  const entrada = { nombre: 'Programa', lineas_accion: lineas };
  const cambios = { id_programa: programa.id_programa, version_esperada: 1, cambios: entrada };
  const comprobar = esperado => async (recibido, datos) => {
    assert.equal(recibido, cliente); assert.deepEqual(datos, esperado);
    return { ...programa, lineas_accion: lineas };
  };
  const creado = await manejarCrearPrograma(cliente, entrada, { crearPrograma: comprobar(entrada) });
  const editado = await manejarActualizarPrograma(cliente, cambios, { actualizarPrograma: comprobar(cambios) });
  assert.equal(creado.codigo, 'PROGRAMA_CREADO');
  assert.equal(editado.codigo, 'PROGRAMA_ACTUALIZADO');
});

it('no devuelve éxito si falla el programa o la consulta de líneas', async () => {
  const fallar = async () => { throw new ErrorOperacionPrograma('NO_ENCONTRADO', 'No existe.'); };
  assert.equal((await manejarObtenerProgramaPorId({}, { id_programa: programa.id_programa }, { ...operaciones, obtenerProgramaPorId: fallar })).codigo, 'NO_ENCONTRADO');
  assert.equal((await manejarCrearPrograma({}, {}, { crearPrograma: fallar })).ok, false);
  const respuesta = await manejarListarProgramas({}, { ...operaciones, listarLineas: async () => {
    throw new ErrorOperacionLineaAccionPrograma('ERROR_BASE_DATOS', 'No se pudieron consultar las líneas.');
  } });
  assert.equal(respuesta.ok, false); assert.equal(respuesta.datos, null);
});

it('los errores conservan códigos sin exponer detalles internos', () => {
  const error = crearRespuestaErrorPrograma(new Error('secreto interno'));
  assert.equal(error.codigo, 'ERROR_INTERNO');
  assert.ok(!JSON.stringify(error).includes('secreto interno'));
  assert.equal(crearRespuestaErrorPrograma(Object.assign(new Error('Configuración'), { name: 'ErrorConfiguracionSupabase' })).codigo, 'CONFIGURACION_SUPABASE');
});

it('explica las restricciones de guardado con mensajes corregibles', () => {
  assert.equal(
    mensajeRestriccionPrograma({ code: '23505', message: 'detalle interno' }),
    'Hay líneas de acción repetidas. Cada línea debe tener un nombre diferente.',
  );
  assert.equal(
    mensajeRestriccionPrograma({ code: '22023', message: 'Faltan campos obligatorios.' }),
    'Faltan campos obligatorios.',
  );
  assert.equal(
    mensajeRestriccionPrograma({ code: '23514', message: 'detalle interno' }),
    'Algún texto está vacío o supera el máximo permitido. Revisa especialmente las líneas de acción y sus resultados.',
  );
});
