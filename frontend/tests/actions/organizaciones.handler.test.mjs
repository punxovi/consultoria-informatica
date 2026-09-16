import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  manejarActualizarOrganizacion,
  manejarCrearOrganizacion,
  manejarListarOrganizaciones,
  manejarObtenerOrganizacionPorId,
} from '../../src/actions/organizaciones/organizaciones.handler.ts';
import { ErrorOperacionOrganizacion } from '../../src/lib/server/organizaciones.ts';

const cliente = {};
const organizacion = {
  id_organizacion: '20000000-0000-4000-8000-000000000001',
  id_pais: '10000000-0000-4000-8000-000000000001',
  nombre: 'Organización Esperanza',
  nombre_representante: 'María Pérez',
  telefono: '+56 9 1234 5678',
  correo: 'contacto@ejemplo.cl',
  region_departamento: 'Metropolitana',
  comuna_municipio_ciudad: 'Santiago',
  direccion: 'Avenida Principal 123',
  publico_objetivo: 'Familias de la comunidad',
  descripcion_breve: 'Organización comunitaria de prueba',
  tipo_organizacion: 'centro_comunitario',
  tipo_organizacion_otro: null,
  numero_beneficiarios: 120,
  created_at: '2026-09-16T12:00:00.000Z',
  updated_at: '2026-09-16T12:00:00.000Z',
  created_by: null,
  updated_by: null,
  archived_at: null,
  version: 1,
  pais: {
    id_pais: '10000000-0000-4000-8000-000000000001',
    codigo_iso: 'CL',
    nombre: 'Chile',
  },
};

function crearOperaciones(sobrescrituras = {}) {
  return {
    listar: async () => [organizacion],
    obtenerPorId: async () => organizacion,
    crear: async () => organizacion,
    actualizar: async () => ({ ...organizacion, version: 2 }),
    ...sobrescrituras,
  };
}

describe('handlers de Actions de organizaciones', () => {
  it('lista organizaciones y traduce los filtros al repositorio', async () => {
    let filtrosRecibidos;
    const operaciones = crearOperaciones({
      listar: async (_cliente, filtros) => {
        filtrosRecibidos = filtros;
        return [organizacion];
      },
    });

    const respuesta = await manejarListarOrganizaciones(
      cliente,
      {
        id_pais: organizacion.id_pais,
        incluir_archivadas: true,
      },
      operaciones,
    );

    assert.deepEqual(filtrosRecibidos, {
      idPais: organizacion.id_pais,
      incluirArchivadas: true,
    });
    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'ORGANIZACIONES_LISTADAS');
    assert.deepEqual(respuesta.datos, [organizacion]);
  });

  it('consulta una organización por ID', async () => {
    let idRecibido;
    const operaciones = crearOperaciones({
      obtenerPorId: async (_cliente, id) => {
        idRecibido = id;
        return organizacion;
      },
    });

    const respuesta = await manejarObtenerOrganizacionPorId(
      cliente,
      { id_organizacion: organizacion.id_organizacion },
      operaciones,
    );

    assert.equal(idRecibido, organizacion.id_organizacion);
    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'ORGANIZACION_OBTENIDA');
  });

  it('crea una organización y conserva la respuesta definida', async () => {
    let entradaRecibida;
    const entrada = {
      id_pais: organizacion.id_pais,
      nombre: organizacion.nombre,
      nombre_representante: organizacion.nombre_representante,
      telefono: organizacion.telefono,
      correo: organizacion.correo,
      region_departamento: organizacion.region_departamento,
      comuna_municipio_ciudad: organizacion.comuna_municipio_ciudad,
      direccion: organizacion.direccion,
      publico_objetivo: organizacion.publico_objetivo,
      descripcion_breve: organizacion.descripcion_breve,
      tipo_organizacion: organizacion.tipo_organizacion,
      numero_beneficiarios: organizacion.numero_beneficiarios,
    };
    const operaciones = crearOperaciones({
      crear: async (_cliente, datos) => {
        entradaRecibida = datos;
        return organizacion;
      },
    });

    const respuesta = await manejarCrearOrganizacion(
      cliente,
      entrada,
      operaciones,
    );

    assert.deepEqual(entradaRecibida, entrada);
    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'ORGANIZACION_CREADA');
    assert.equal(respuesta.datos.id_organizacion, organizacion.id_organizacion);
  });

  it('actualiza con control de versión', async () => {
    let argumentosRecibidos;
    const operaciones = crearOperaciones({
      actualizar: async (_cliente, id, cambios, version) => {
        argumentosRecibidos = { id, cambios, version };
        return { ...organizacion, ...cambios, version: 2 };
      },
    });

    const respuesta = await manejarActualizarOrganizacion(
      cliente,
      {
        id_organizacion: organizacion.id_organizacion,
        version_esperada: 1,
        cambios: { nombre: 'Organización actualizada' },
      },
      operaciones,
    );

    assert.deepEqual(argumentosRecibidos, {
      id: organizacion.id_organizacion,
      cambios: { nombre: 'Organización actualizada' },
      version: 1,
    });
    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'ORGANIZACION_ACTUALIZADA');
    assert.equal(respuesta.datos.version, 2);
  });

  it('devuelve errores de dominio sin exponer detalles de Supabase', async () => {
    const operaciones = crearOperaciones({
      obtenerPorId: async () => {
        throw new ErrorOperacionOrganizacion(
          'NO_ENCONTRADA',
          'La organización solicitada no existe.',
        );
      },
    });

    const respuesta = await manejarObtenerOrganizacionPorId(
      cliente,
      { id_organizacion: organizacion.id_organizacion },
      operaciones,
    );

    assert.deepEqual(respuesta, {
      ok: false,
      codigo: 'NO_ENCONTRADA',
      mensaje: 'La organización solicitada no existe.',
      datos: null,
    });
  });

  it('convierte fallos inesperados en un error estable', async () => {
    const operaciones = crearOperaciones({
      crear: async () => {
        throw new Error('detalle interno que no debe exponerse');
      },
    });

    const respuesta = await manejarCrearOrganizacion(
      cliente,
      {
        id_pais: organizacion.id_pais,
        nombre: organizacion.nombre,
        nombre_representante: organizacion.nombre_representante,
        telefono: organizacion.telefono,
        correo: organizacion.correo,
        region_departamento: organizacion.region_departamento,
        comuna_municipio_ciudad: organizacion.comuna_municipio_ciudad,
        direccion: organizacion.direccion,
        publico_objetivo: organizacion.publico_objetivo,
        descripcion_breve: organizacion.descripcion_breve,
        tipo_organizacion: organizacion.tipo_organizacion,
        numero_beneficiarios: organizacion.numero_beneficiarios,
      },
      operaciones,
    );

    assert.deepEqual(respuesta, {
      ok: false,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado al gestionar la organización.',
      datos: null,
    });
  });
});
