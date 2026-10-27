import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_NOMBRE,
  crearCoordinadorSchema,
  editarCoordinadorSchema,
  erroresDeValidacion,
  filtrarCoordinadores,
  ordenarCoordinadores,
} from '../../src/lib/coordinadores/modelo.ts';

const chile = '14700000-0000-4000-8000-000000000001';
const peru = '14700000-0000-4000-8000-000000000002';
const valido = { nombre: 'María Castillo', correo: 'maria@fundacion.org', id_pais: chile };

const erroresDe = (schema, datos) => {
  const r = schema.safeParse(datos);
  return r.success ? {} : erroresDeValidacion(r.error);
};

test('crear: nombre, correo y país principal son obligatorios y cada error apunta a su campo', () => {
  assert.ok(crearCoordinadorSchema.safeParse(valido).success);
  assert.deepEqual(erroresDe(crearCoordinadorSchema, { nombre: '  ', correo: '', id_pais: '' }), {
    nombre: 'Ingresa el nombre del Coordinador.',
    correo: 'Ingresa el correo electrónico.',
    id_pais: 'Selecciona el país principal.',
  });
  // HU01: sin país principal se rechaza e indica el campo faltante.
  assert.deepEqual(Object.keys(erroresDe(crearCoordinadorSchema, { ...valido, id_pais: '' })), ['id_pais']);
});

test('crear: valida formato de correo, largo del nombre y país válido', () => {
  assert.match(erroresDe(crearCoordinadorSchema, { ...valido, correo: 'maria@' }).correo, /correo electrónico válido/);
  assert.match(erroresDe(crearCoordinadorSchema, { ...valido, correo: 'maria fundacion.org' }).correo, /válido/);
  assert.match(erroresDe(crearCoordinadorSchema, { ...valido, nombre: 'a'.repeat(LIMITE_NOMBRE + 1) }).nombre, /120/);
  assert.match(erroresDe(crearCoordinadorSchema, { ...valido, id_pais: 'chile' }).id_pais, /válido/);
});

test('crear: normaliza espacios y deja el correo en minúsculas', () => {
  const r = crearCoordinadorSchema.parse({ nombre: '  María Castillo ', correo: ' Maria@Fundacion.ORG ', id_pais: chile });
  assert.deepEqual(r, { nombre: 'María Castillo', correo: 'maria@fundacion.org', id_pais: chile });
});

test('editar: exige nombre y país, y no admite cambiar el correo', () => {
  assert.deepEqual(editarCoordinadorSchema.parse({ ...valido, correo: 'otro@x.org' }), { nombre: 'María Castillo', id_pais: chile });
  assert.deepEqual(Object.keys(erroresDe(editarCoordinadorSchema, { nombre: '', id_pais: '' })).sort(), ['id_pais', 'nombre']);
});

const cuentas = [
  { id_usuario: '14700000-0000-4000-8000-0000000000a1', nombre: 'Ana Ñúñez', correo: 'ana@fge.org', id_pais: chile, activo: true, version: 1 },
  { id_usuario: '14700000-0000-4000-8000-0000000000a2', nombre: 'Bruno Díaz', correo: 'bruno@fge.org', id_pais: peru, activo: false, version: 2 },
  { id_usuario: '14700000-0000-4000-8000-0000000000a3', nombre: 'Carla Soto', correo: 'csoto@fge.org', id_pais: chile, activo: false, version: 1 },
];
const nombres = (lista) => lista.map((c) => c.nombre);
const todos = { texto: '', estado: 'todas', idPais: '' };

test('filtrar: busca por nombre o correo sin distinguir tildes ni mayúsculas', () => {
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, texto: 'nunez' })), ['Ana Ñúñez']);
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, texto: 'CSOTO@' })), ['Carla Soto']);
  assert.deepEqual(filtrarCoordinadores(cuentas, { ...todos, texto: 'nadie' }), []);
});

test('filtrar: por estado y país principal, combinables', () => {
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, estado: 'activas' })), ['Ana Ñúñez']);
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, estado: 'inactivas' })), ['Bruno Díaz', 'Carla Soto']);
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, idPais: chile })), ['Ana Ñúñez', 'Carla Soto']);
  assert.deepEqual(nombres(filtrarCoordinadores(cuentas, { ...todos, idPais: chile, estado: 'inactivas' })), ['Carla Soto']);
  assert.equal(filtrarCoordinadores(cuentas, todos).length, 3);
});

test('ordenar: primero las activas y luego por nombre, sin modificar la lista original', () => {
  const desordenadas = [cuentas[2], cuentas[1], cuentas[0]];
  assert.deepEqual(nombres(ordenarCoordinadores(desordenadas)), ['Ana Ñúñez', 'Bruno Díaz', 'Carla Soto']);
  assert.deepEqual(nombres(desordenadas), ['Carla Soto', 'Bruno Díaz', 'Ana Ñúñez']);
});
