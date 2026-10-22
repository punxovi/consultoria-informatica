import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import {
  parseCreateDonation,
  parseCreateDonationFile,
  parseUploadDonationFile,
  normalizarTipoRespaldo,
  assertFileSignature,
  TIPOS_RESPALDO,
} from '../src/domain/donations.ts';
import { createOrganizationsApplication } from '../src/application/organizations-service.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';
const hu20 = { id_pais: '13000000-0000-4000-8000-000000000011', tipo_donante: 'empresa', origen: 'Campaña', estado: 'Comprometida' } as const;

test('SCRUM-130: repositorio conserva metadatos HU20 en registro y consulta', async () => {
  const orgId = '13000000-0000-4000-8000-000000000001';
  const input = parseCreateDonation({ fecha: '2026-10-20', tipo_movimiento: 'recibida',
    contraparte_nombre: 'Empresa', descripcion: 'Horas profesionales', tipo_aporte: 'recurso',
    categoria: 'Servicio', tipo_donante: 'empresa', origen: 'Campaña', estado: 'Comprometida',
    id_pais: '13000000-0000-4000-8000-000000000011', id_programa: '13000000-0000-4000-8000-000000000002',
    valor_estimado: 100, moneda_valorizacion: 'CLP', metodo_valorizacion: 'Cotización' });
  let stored: Record<string, unknown> = {};
  const repository = createSupabaseOrganizationsRepository({ supabaseUrl: 'https://supabase.invalid', anonKey: 'public-test',
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/organizaciones')) return Response.json([{ id_organizacion: orgId, id_pais: hu20.id_pais, nombre: 'Organización prueba' }]);
      if (path.endsWith('/puede_gestionar_donaciones')) return Response.json(true);
      if (path.endsWith('/paises')) return Response.json([{ id_pais: hu20.id_pais }]);
      if (path.endsWith('/programas')) return Response.json([{ id_programa: input.id_programa }]);
      if (init?.method === 'POST') stored = { ...JSON.parse(String(init.body)), id_donacion: '13000000-0000-4000-8000-000000000003' };
      return Response.json([stored]);
    } });
  const created = await repository.createDonation('fake-session', orgId, input);
  const read = await repository.getDonationById('fake-session', orgId, created.id_donacion);
  for (const key of ['id_pais','id_programa','categoria','tipo_donante','origen','estado','valor_estimado','moneda_valorizacion','metodo_valorizacion'] as const) {
    assert.equal(created[key], input[key]);
    assert.equal(read[key], input[key]);
  }
});

test('SCRUM-130: contrato HU20 y valorización independiente del monto efectivo', () => {
  const input = { ...hu20, fecha: '2026-10-20', tipo_movimiento: 'recibida', contraparte_nombre: 'Empresa',
    descripcion: 'Horas profesionales', tipo_aporte: 'recurso', categoria: 'Servicio',
    tipo_donante: 'empresa', origen: 'Campaña local', estado: 'Comprometida',
    valor_estimado: 100, moneda_valorizacion: 'CLP', metodo_valorizacion: 'Cotización' };
  assert.equal(parseCreateDonation(input).valor_estimado, 100);
  for (const changes of [
    { categoria: 'Alimentos' }, { estado: 'Pendiente' }, { tipo_donante: 'otro' },
    { valor_estimado: -1 }, { valor_estimado: Infinity }, { moneda_valorizacion: undefined },
    { categoria: 'Otro' }, { categoria_otro: 'No corresponde' }, { categoria: 'Dinero' },
    { cantidad: 2 },
  ]) assert.throws(() => parseCreateDonation({ ...input, ...changes }));
  assert.equal(parseCreateDonation({ ...input, categoria: 'Otro', categoria_otro: 'Otro aporte' }).categoria, 'Otro');
});

test('Donaciones: normaliza y valida tipos de aporte (dinero y recursos)', () => {
  // Dinero válido
  const dineroValido = parseCreateDonation({
    ...hu20, categoria: 'Dinero',
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Fundación Alianza',
    descripcion: 'Aporte para equipamiento',
    tipo_aporte: 'dinero',
    monto: 500000,
    moneda: 'CLP',
  });
  assert.equal(dineroValido.monto, 500000);
  assert.equal(dineroValido.moneda, 'CLP');

  // Recurso válido
  const recursoValido = parseCreateDonation({
    ...hu20, categoria: 'Producto',
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Comunidad Vecinal',
    descripcion: 'Cajas de alimentos',
    tipo_aporte: 'recurso',
    cantidad: 20,
    unidad: 'cajas',
  });
  assert.equal(recursoValido.cantidad, 20);
  assert.equal(recursoValido.unidad, 'cajas');

  // Dinero sin monto debe fallar
  assert.throws(
    () => parseCreateDonation({
      ...hu20, categoria: 'Dinero',
      fecha: '2026-10-19',
      tipo_movimiento: 'recibida',
      contraparte_nombre: 'Empresa',
      descripcion: 'Aporte',
      tipo_aporte: 'dinero',
    }),
    /El aporte en dinero exige un monto mayor a 0/
  );

  // Recurso sin unidad debe fallar
  assert.throws(
    () => parseCreateDonation({
      ...hu20, categoria: 'Producto',
      fecha: '2026-10-19',
      tipo_movimiento: 'recibida',
      contraparte_nombre: 'Empresa',
      descripcion: 'Aporte',
      tipo_aporte: 'recurso',
      cantidad: 10,
    }),
    /El aporte de recursos exige especificar la unidad/
  );
});

test('Respaldos de donación: normaliza los tipos contemplados y valida formatos', () => {
  assert.equal(normalizarTipoRespaldo('comprobante'), 'comprobante');
  assert.equal(normalizarTipoRespaldo('acta de entrega'), 'acta_entrega');
  assert.equal(normalizarTipoRespaldo('acta_entrega'), 'acta_entrega');
  assert.equal(normalizarTipoRespaldo('certificado'), 'certificado');
  assert.equal(normalizarTipoRespaldo('fotografía'), 'fotografia');
  assert.equal(normalizarTipoRespaldo('fotografia'), 'fotografia');

  assert.throws(() => normalizarTipoRespaldo('invalido'), /El tipo de respaldo debe ser/);

  // Reserva válida
  const reserva = parseCreateDonationFile({
    tipo_respaldo: 'acta de entrega',
    nombre_original: 'acta_donacion.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 1024,
    descripcion: 'Acta firmada de recepción',
  });
  assert.equal(reserva.tipo_respaldo, 'acta_entrega');
  assert.equal(reserva.mime_type, 'application/pdf');

  // Extensión inconsistente debe fallar
  assert.throws(
    () => parseCreateDonationFile({
      tipo_respaldo: 'fotografia',
      nombre_original: 'foto.txt',
      mime_type: 'image/jpeg',
      tamano_bytes: 1024,
    }),
    /La extensión del archivo no corresponde/
  );

  // Archivo vacío debe fallar
  assert.throws(
    () => parseCreateDonationFile({
      tipo_respaldo: 'comprobante',
      nombre_original: 'recibo.pdf',
      mime_type: 'application/pdf',
      tamano_bytes: 0,
    }),
    /El archivo no puede estar vacío/
  );

  // Archivo mayor a 50 MiB debe fallar
  assert.throws(
    () => parseCreateDonationFile({
      tipo_respaldo: 'comprobante',
      nombre_original: 'recibo.pdf',
      mime_type: 'application/pdf',
      tamano_bytes: 60 * 1024 * 1024,
    }),
    /supera el límite de 50 MiB/
  );
});

test('Respaldos: valida firmas binarias de formatos admitidos (PDF, JPEG, PNG, WEBP)', () => {
  const pdfBytes = Buffer.from('%PDF-1.4 contenido del pdf');
  assert.doesNotThrow(() => assertFileSignature(pdfBytes, 'application/pdf'));

  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  assert.doesNotThrow(() => assertFileSignature(jpegBytes, 'image/jpeg'));

  const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0x00]);
  assert.doesNotThrow(() => assertFileSignature(pngBytes, 'image/png'));

  const fakeBytes = Buffer.from('archivo falso que no es pdf');
  assert.throws(() => assertFileSignature(fakeBytes, 'application/pdf'), /El contenido del archivo no corresponde/);
});

test('HTTP: flujo completo de creación de donación, reserva, carga y descarga de respaldo', async () => {
  const donationId = '77777777-7777-4777-8777-777777777777';
  const orgId = '11111111-1111-4111-8111-111111111111';
  const fileId = '88888888-8888-4888-8888-888888888888';

  let donationFileState = {
    id_archivo: fileId,
    id_donacion: donationId,
    bucket_id: 'fge-archivos',
    ruta_objeto: `donaciones/${donationId}/${fileId}.pdf`,
    nombre_original: 'comprobante.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 18,
    categoria: 'comprobante',
    tipo_respaldo: 'comprobante' as const,
    descripcion: 'Comprobante de transferencia',
    estado_carga: 'reservado' as const,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const storedBytes = Buffer.from('%PDF-1.5 prueba ok');

  const mockRepo = {
    list: async () => [],
    getById: async () => ({ id_organizacion: orgId } as any),
    create: async () => ({} as any),
    update: async () => ({} as any),
    listCountries: async () => [],
    getLegalRecord: async () => null,
    createLegalRecord: async () => ({} as any),
    updateLegalRecord: async () => ({} as any),
    listCommitments: async () => [],
    listCommitmentOrigins: async () => ({ actas: [] }),
    createCommitment: async () => ({} as any),
    getCommitmentById: async () => ({} as any),
    updateCommitment: async () => ({} as any),
    listDiagnosticos: async () => [],
    createDiagnostico: async () => ({} as any),
    getDiagnosticoById: async () => ({} as any),
    updateDiagnostico: async () => ({} as any),

    listDonations: async () => [
      {
        id_donacion: donationId,
        id_organizacion: orgId,
        fecha: '2026-10-19',
        tipo_movimiento: 'recibida' as const,
        contraparte_nombre: 'Alianza FGE',
        descripcion: 'Donación de apoyo',
        tipo_aporte: 'dinero' as const,
        cantidad: null,
        unidad: null,
        monto: 100000,
        moneda: 'CLP',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    getDonationById: async () => ({
      id_donacion: donationId,
      id_organizacion: orgId,
      fecha: '2026-10-19',
      tipo_movimiento: 'recibida' as const,
      contraparte_nombre: 'Alianza FGE',
      descripcion: 'Donación de apoyo',
      tipo_aporte: 'dinero' as const,
      cantidad: null,
      unidad: null,
      monto: 100000,
      moneda: 'CLP',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    createDonation: async (_t: string, _o: string, input: any) => ({
      id_donacion: donationId,
      id_organizacion: orgId,
      ...input,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    listDonationFiles: async () => [donationFileState],
    getDonationFileById: async () => donationFileState,
    reserveDonationFile: async (_t: string, _d: string, input: any) => {
      donationFileState = {
        ...donationFileState,
        nombre_original: input.nombre_original,
        mime_type: input.mime_type,
        tamano_bytes: input.tamano_bytes,
        categoria: input.tipo_respaldo,
        tipo_respaldo: input.tipo_respaldo,
        estado_carga: 'reservado',
      };
      return donationFileState;
    },
    uploadDonationFile: async () => {
      donationFileState = { ...donationFileState, estado_carga: 'disponible', version: 2 };
      return donationFileState;
    },
    downloadDonationFile: async () => ({
      bytes: storedBytes,
      mimeType: 'application/pdf',
      fileName: 'comprobante.pdf',
    }),
  };

  const app = createOrganizationsApplication(mockRepo);
  const server = createOrganizationsServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const authHeaders = { authorization: 'Bearer test-token' };

    // 1. Listar donaciones
    const listRes = await fetch(`${baseUrl}/v1/organizations/${orgId}/donations`, { headers: authHeaders });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.data.donations.length, 1);

    // 2. Crear donación
    const createRes = await fetch(`${baseUrl}/v1/organizations/${orgId}/donations`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...hu20, categoria: 'Dinero',
        fecha: '2026-10-19',
        tipo_movimiento: 'recibida',
        contraparte_nombre: 'Empresa Social',
        descripcion: 'Donación empresarial',
        tipo_aporte: 'dinero',
        monto: 250000,
        moneda: 'CLP',
      }),
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.data.donation.descripcion, 'Donación empresarial');

    // 3. Listar archivos de la donación
    const listFilesRes = await fetch(`${baseUrl}/v1/organizations/${orgId}/donations/${donationId}/files`, {
      headers: authHeaders,
    });
    assert.equal(listFilesRes.status, 200);
    const listFilesData = await listFilesRes.json();
    assert.equal(listFilesData.data.files.length, 1);

    // 4. Reservar respaldo
    const reserveRes = await fetch(`${baseUrl}/v1/organizations/${orgId}/donations/${donationId}/files`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo_respaldo: 'acta de entrega',
        nombre_original: 'acta.pdf',
        mime_type: 'application/pdf',
        tamano_bytes: 18,
        descripcion: 'Acta de entrega oficial',
      }),
    });
    assert.equal(reserveRes.status, 201);
    const reserveData = await reserveRes.json();
    assert.equal(reserveData.data.file.estado_carga, 'reservado');
    assert.equal(reserveData.data.file.tipo_respaldo, 'acta_entrega');

    // 5. Cargar archivo binario
    const uploadRes = await fetch(
      `${baseUrl}/v1/organizations/${orgId}/donations/${donationId}/files/${fileId}?version_esperada=1`,
      {
        method: 'PUT',
        headers: { ...authHeaders, 'content-type': 'application/pdf', 'content-length': '18' },
        body: storedBytes,
      },
    );
    assert.equal(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.equal(uploadData.data.file.estado_carga, 'disponible');

    // 6. Descargar archivo
    const downloadRes = await fetch(
      `${baseUrl}/v1/organizations/${orgId}/donations/${donationId}/files/${fileId}/file`,
      { headers: authHeaders },
    );
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers.get('content-type'), 'application/pdf');
    assert.match(downloadRes.headers.get('content-disposition') ?? '', /attachment/);
    assert.equal(downloadRes.headers.get('cache-control'), 'private, no-store');
    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    assert.deepEqual(downloadedBytes, storedBytes);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
