import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteDonaciones } from '../../src/lib/donaciones/cliente.ts';

const idOrg = '11111111-1111-4111-8111-111111111111';
const idDonacion = '22222222-2222-4222-8222-222222222222';
const idArchivo = '33333333-3333-4333-8333-333333333333';

const donacionEjemplo = {
  id_donacion: idDonacion,
  id_organizacion: idOrg,
  fecha: '2026-10-19',
  tipo_movimiento: 'recibida',
  contraparte_nombre: 'Fundación Aliada',
  descripcion: 'Donación de víveres',
  tipo_aporte: 'recurso',
  cantidad: 20,
  unidad: 'cajas',
  version: 1,
};

const respaldoEjemplo = {
  id_archivo: idArchivo,
  id_donacion: idDonacion,
  bucket_id: 'fge-archivos',
  ruta_objeto: `donaciones/${idDonacion}/${idArchivo}.pdf`,
  nombre_original: 'comprobante.pdf',
  mime_type: 'application/pdf',
  tamano_bytes: 2048,
  categoria: 'comprobante',
  tipo_respaldo: 'comprobante',
  descripcion: 'Comprobante bancario',
  estado_carga: 'reservado',
  version: 1,
};

test('cliente donaciones: listar, obtener y crear donaciones', async () => {
  const llamadas = [];
  const cliente = crearClienteDonaciones('http://api.test', async () => 'jwt-token', async (url, init) => {
    llamadas.push({ url, init });
    if (init?.method === 'POST') {
      return Response.json({
        ok: true,
        code: 'DONACION_CREADA',
        message: 'Donación creada',
        data: { donation: donacionEjemplo },
      });
    }
    if (url.endsWith(`/donations/${idDonacion}`)) {
      return Response.json({
        ok: true,
        code: 'DONACION_OBTENIDA',
        message: 'Donación obtenida',
        data: { donation: donacionEjemplo },
      });
    }
    return Response.json({
      ok: true,
      code: 'DONACIONES_OBTENIDAS',
      message: 'Donaciones obtenidas',
      data: { donations: [donacionEjemplo] },
    });
  });

  const lista = await cliente.listarDonaciones(idOrg);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id_donacion, idDonacion);

  const obtenida = await cliente.obtenerDonacion(idOrg, idDonacion);
  assert.equal(obtenida.contraparte_nombre, 'Fundación Aliada');

  const creada = await cliente.crearDonacion(idOrg, {
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Fundación Aliada',
    descripcion: 'Donación de víveres',
    tipo_aporte: 'recurso',
    cantidad: 20,
    unidad: 'cajas',
  });
  assert.equal(creada.id_donacion, idDonacion);
  assert.equal(llamadas[2].init.headers.authorization, 'Bearer jwt-token');
});

test('cliente donaciones: ciclo de respaldo (reserva, subida binaria y descarga autenticada)', async () => {
  const llamadas = [];
  const cliente = crearClienteDonaciones('http://api.test', async () => 'jwt-token', async (url, init) => {
    llamadas.push({ url, init });
    if (init?.method === 'PUT' && url.includes('/file?version_esperada=1')) {
      return Response.json({
        ok: true,
        code: 'ARCHIVO_DONACION_CONFIRMADO',
        message: 'Archivo confirmado',
        data: {
          file: {
            ...respaldoEjemplo,
            estado_carga: 'disponible',
            version: 2,
          },
        },
      });
    }
    if (init?.method === 'GET' && url.endsWith('/file')) {
      return new Response(Buffer.from('%PDF-1.4\n...fake pdf content...'), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="comprobante.pdf"',
        },
      });
    }
    if (init?.method === 'POST') {
      return Response.json({
        ok: true,
        code: 'ARCHIVO_DONACION_RESERVADO',
        message: 'Archivo reservado',
        data: { file: respaldoEjemplo },
      });
    }
    return Response.json({
      ok: true,
      code: 'ARCHIVOS_DONACION_OBTENIDOS',
      message: 'Archivos obtenidos',
      data: { files: [respaldoEjemplo] },
    });
  });

  // 1. Listar respaldos
  const respaldos = await cliente.listarRespaldos(idOrg, idDonacion);
  assert.equal(respaldos.length, 1);
  assert.equal(respaldos[0].tipo_respaldo, 'comprobante');

  // 2. Reservar respaldo
  const reservado = await cliente.reservarRespaldo(idOrg, idDonacion, {
    tipo_respaldo: 'comprobante',
    nombre_original: 'comprobante.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 2048,
    descripcion: 'Comprobante bancario',
  });
  assert.equal(reservado.estado_carga, 'reservado');

  // 3. Subir archivo binario
  const file = new Blob(['%PDF-1.4\nfake content'], { type: 'application/pdf' });
  const confirmado = await cliente.subirRespaldo(idOrg, reservado, file);
  assert.equal(confirmado.estado_carga, 'disponible');
  assert.equal(confirmado.version, 2);

  // 4. Descargar archivo privado (autenticado)
  const blob = await cliente.descargarRespaldo(idOrg, confirmado);
  assert.ok(blob.size > 0);
  assert.equal(llamadas[3].init.headers.authorization, 'Bearer jwt-token');
});

test('cliente donaciones: rechaza archivos asociados a otra donación o respuestas corruptas', async () => {
  const cliente = crearClienteDonaciones('http://api.test', async () => 'jwt-token', async () => {
    return Response.json({
      ok: true,
      code: 'ARCHIVOS_DONACION_OBTENIDOS',
      data: {
        files: [
          {
            ...respaldoEjemplo,
            id_donacion: '99999999-9999-4999-8999-999999999999', // otra donación
          },
        ],
      },
    });
  });

  await assert.rejects(
    () => cliente.listarRespaldos(idOrg, idDonacion),
    (err) => err.code === 'RESPUESTA_INVALIDA',
  );
});

test('cliente donaciones: falla limpiamente si la carga no queda en estado disponible', async () => {
  const cliente = crearClienteDonaciones('http://api.test', async () => 'jwt-token', async (url, init) => {
    if (init?.method === 'PUT') {
      return Response.json({
        ok: true,
        data: {
          file: {
            ...respaldoEjemplo,
            estado_carga: 'fallido',
            version: 2,
          },
        },
      });
    }
    return Response.json({ ok: false }, { status: 500 });
  });

  const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  await assert.rejects(
    () => cliente.subirRespaldo(idOrg, respaldoEjemplo, file),
    (err) => err.code === 'CARGA_PENDIENTE',
  );
});
