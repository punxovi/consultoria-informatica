import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoExpediente, camposLegales } from '../helpers/expediente-entorno.mjs';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
import { crearClienteExpediente } from '../../src/lib/expediente-legal/cliente.ts';
import { documentosVacios } from '../../src/lib/expediente-legal/modelo.ts';

test('Expediente Legal: flujo completo Cliente HTTP → API Gateway → Backend → Supabase (persistencia, RLS, concurrencia)', async () => {
  const entorno = await crearEntornoExpediente();
  try {
    const { db, gatewayUrl, solicitudes } = entorno;
    const org = await entorno.crearOrganizacion('CL');
    const id = org.id_organizacion;

    const transport = createApiTransport(gatewayUrl);
    const cliente = crearClienteExpediente(transport, async () => 'qa-admin');

    // 1. Contemplar registro inexistente: debe devolver null
    const inicial = await cliente.obtener(id);
    assert.equal(inicial, null, 'Una organización sin expediente debe devolver null');

    // 2. Registro inicial (POST): crear antecedentes y documento PDF
    const estatutosPdf = new File(['%PDF-1.7 contenido prueba estatutos'], 'estatutos-fge.pdf', {
      type: 'application/pdf',
    });

    const entradaCrear = {
      campos: camposLegales,
      documentos: [
        { tipo: 'identidad_representante', estado: 'pendiente' },
        { tipo: 'identificacion_legal', estado: 'no_aplica' },
        { tipo: 'estatutos', estado: 'cargado' },
      ],
      archivos: {
        estatutos: estatutosPdf,
      },
    };

    const creado = await cliente.crear(id, entradaCrear);
    assert.ok(creado.id_informacion_legal);
    assert.equal(creado.id_organizacion, id);
    assert.equal(creado.version, 1);
    assert.equal(creado.numero_registro, camposLegales.numero_registro);
    assert.equal(creado.estado_personalidad_juridica, 'si');

    // Comprobar persistencia real en la base de datos
    const dbRecord = (await db.query(
      'SELECT * FROM public.informacion_legal WHERE id_organizacion = $1',
      [id]
    )).rows[0];
    assert.ok(dbRecord);
    assert.equal(dbRecord.id_informacion_legal, creado.id_informacion_legal);
    assert.equal(Number(dbRecord.version), 1);
    assert.equal(dbRecord.numero_registro, 'REG-2026-FGE');

    const dbDocs = (await db.query(
      'SELECT * FROM public.documentos_informacion_legal WHERE id_informacion_legal = $1',
      [creado.id_informacion_legal]
    )).rows;
    assert.equal(dbDocs.length, 3);
    const docEstatutos = dbDocs.find(d => d.tipo === 'estatutos');
    assert.equal(docEstatutos.estado, 'cargado');

    // 3. Consulta de información real (GET) a través del Gateway
    const consultado = await cliente.obtener(id);
    assert.ok(consultado);
    assert.equal(consultado.id_informacion_legal, creado.id_informacion_legal);
    assert.equal(consultado.version, 1);
    const estatutosConsultado = consultado.documentos.find(d => d.tipo === 'estatutos');
    assert.equal(estatutosConsultado.estado, 'cargado');
    assert.equal(estatutosConsultado.nombre_archivo, 'estatutos-fge.pdf');

    // 4. Actualización (PATCH) con control de versión
    const entradaActualizar = {
      campos: {
        ...camposLegales,
        numero_registro: 'REG-2026-ACTUALIZADO',
        vigencia_directiva: 'Vigente hasta 2030',
      },
      documentos: [
        { tipo: 'identidad_representante', estado: 'pendiente' },
        { tipo: 'identificacion_legal', estado: 'no_aplica' },
        { tipo: 'estatutos', estado: 'cargado' },
      ],
      archivos: {},
    };

    const actualizado = await cliente.actualizar(id, 1, entradaActualizar);
    assert.equal(actualizado.version, 2);
    assert.equal(actualizado.numero_registro, 'REG-2026-ACTUALIZADO');
    assert.equal(actualizado.vigencia_directiva, 'Vigente hasta 2030');

    // Verificar que la versión actualizada se refleja en consulta posterior
    const postActualizado = await cliente.obtener(id);
    assert.equal(postActualizado.version, 2);
    assert.equal(postActualizado.numero_registro, 'REG-2026-ACTUALIZADO');

    // 5. Conflicto de concurrencia (409) al intentar actualizar con versión desactualizada
    await assert.rejects(
      cliente.actualizar(id, 1, entradaActualizar),
      error => error.code === 'CONFLICTO_CONCURRENCIA' && error.status === 409
    );

    // 6. Conflicto de creación duplicada (409)
    await assert.rejects(
      cliente.crear(id, entradaCrear),
      error => (error.code === 'EXPEDIENTE_EXISTENTE' || error.code === 'CONFLICTO_CONCURRENCIA') && error.status === 409
    );

    // 7. Solicitud sin sesión: debe responder 401
    const rutaGateway = `/api/v1/organizations/${id}/legal-record`;
    await assert.rejects(
      transport.request(rutaGateway),
      error => error.code === 'SESION_REQUERIDA' && error.status === 401
    );

    // 8. Validación de organización inexistente: responde 404
    const inexistente = '99999999-9999-4999-8999-999999999999';
    await assert.rejects(
      cliente.obtener(inexistente),
      error => error.code === 'NO_ENCONTRADA' && error.status === 404
    );

    // 9. Alcance territorial y permisos RLS:
    // COORD asignado a Chile puede gestionar Chile pero NO Argentina
    const coord = crearClienteExpediente(transport, async () => 'qa-coord');
    const orgAR = await entorno.crearOrganizacion('AR');

    // Creación en Argentina rechazada para COORD de Chile
    await assert.rejects(
      coord.crear(orgAR.id_organizacion, {
        campos: camposLegales,
        documentos: documentosVacios(),
        archivos: {},
      }),
      error => error.code === 'SIN_PERMISO' && error.status === 403
    );

    // Usuario sin rol no puede acceder
    const sinRol = crearClienteExpediente(transport, async () => 'qa-sin-rol');
    await assert.rejects(
      sinRol.obtener(id),
      error => (error.code === 'SIN_PERMISO' || error.code === 'NO_ENCONTRADA') && [403, 404].includes(error.status)
    );

  } finally {
    await entorno.cerrar();
  }
});
