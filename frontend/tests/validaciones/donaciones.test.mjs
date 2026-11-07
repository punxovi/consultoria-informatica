import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BYTES,
  accept,
  donacionFormSchema,
  donacionRegistroSchema,
  siguienteEstado,
  validarRegistroDonacion,
  donacionSchema,
  normalizarTipoRespaldo,
  respaldoFormSchema,
  respaldoSchema,
  tipoArchivo,
} from '../../src/lib/donaciones/modelo.ts';

test('tipoArchivo: valida formatos permitidos (PDF, JPG, PNG, WebP) y límites', () => {
  assert.equal(tipoArchivo({ name: 'comprobante.pdf', type: 'application/pdf', size: 1024 }), 'application/pdf');
  assert.equal(tipoArchivo({ name: 'foto.jpg', type: 'image/jpeg', size: 2048 }), 'image/jpeg');
  assert.equal(tipoArchivo({ name: 'foto.jpeg', type: 'image/jpeg', size: 2048 }), 'image/jpeg');
  assert.equal(tipoArchivo({ name: 'evidencia.png', type: 'image/png', size: 4096 }), 'image/png');
  assert.equal(tipoArchivo({ name: 'documento.webp', type: 'image/webp', size: 512 }), 'image/webp');
  assert.equal(tipoArchivo({ name: 'sin-mime.PDF', type: '', size: MAX_BYTES }), 'application/pdf');

  // Rechaza archivos inválidos
  assert.throws(() => tipoArchivo({ name: 'malicioso.exe', type: 'application/x-msdownload', size: 100 }));
  assert.throws(() => tipoArchivo({ name: 'inconsistente.pdf', type: 'image/png', size: 100 }));
  assert.throws(() => tipoArchivo({ name: 'vacio.pdf', type: 'application/pdf', size: 0 }));
  assert.throws(() => tipoArchivo({ name: 'enorme.png', type: 'image/png', size: MAX_BYTES + 1 }));
});

test('normalizarTipoRespaldo: normaliza comprobante, acta de entrega, certificado y fotografía', () => {
  assert.equal(normalizarTipoRespaldo('comprobante'), 'comprobante');
  assert.equal(normalizarTipoRespaldo('COMPROBANTE'), 'comprobante');
  assert.equal(normalizarTipoRespaldo('acta_entrega'), 'acta_entrega');
  assert.equal(normalizarTipoRespaldo('Acta de entrega'), 'acta_entrega');
  assert.equal(normalizarTipoRespaldo('certificado'), 'certificado');
  assert.equal(normalizarTipoRespaldo('CERTIFICADO'), 'certificado');
  assert.equal(normalizarTipoRespaldo('fotografia'), 'fotografia');
  assert.equal(normalizarTipoRespaldo('Fotografía'), 'fotografia');

  assert.throws(() => normalizarTipoRespaldo('otro_invalido'));
  assert.throws(() => normalizarTipoRespaldo(''));
});

test('donacionFormSchema: valida donaciones en dinero y recursos', () => {
  // Donación dinero válida
  const dineroOk = donacionFormSchema.safeParse({
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Banco de Alimentos',
    descripcion: 'Aporte para compra de insumos de cocina',
    tipo_aporte: 'dinero',
    monto: 500000,
    moneda: 'CLP',
  });
  assert.ok(dineroOk.success);

  // Donación dinero sin monto o moneda
  const dineroInvalido = donacionFormSchema.safeParse({
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Donante Anónimo',
    descripcion: 'Aporte monetario',
    tipo_aporte: 'dinero',
  });
  assert.equal(dineroInvalido.success, false);

  // Donación recurso válida
  const recursoOk = donacionFormSchema.safeParse({
    fecha: '2026-10-19',
    tipo_movimiento: 'entregada',
    contraparte_nombre: 'Familia González',
    descripcion: 'Entrega de canasta básica de víveres',
    tipo_aporte: 'recurso',
    cantidad: 10,
    unidad: 'cajas familiares',
  });
  assert.ok(recursoOk.success);

  // Donación recurso sin cantidad
  const recursoInvalido = donacionFormSchema.safeParse({
    fecha: '2026-10-19',
    tipo_movimiento: 'entregada',
    contraparte_nombre: 'Familia González',
    descripcion: 'Entrega',
    tipo_aporte: 'recurso',
  });
  assert.equal(recursoInvalido.success, false);
});

test('respaldoSchema y donacionSchema: validan modelos persistidos', () => {
  const donacion = donacionSchema.safeParse({
    id_donacion: '11111111-1111-4111-8111-111111111111',
    id_organizacion: '22222222-2222-4222-8222-222222222222',
    fecha: '2026-10-19',
    tipo_movimiento: 'recibida',
    contraparte_nombre: 'Empresa Solidaria S.A.',
    descripcion: 'Donación de equipamiento',
    tipo_aporte: 'recurso',
    cantidad: 5,
    unidad: 'computadores',
    version: 1,
  });
  assert.ok(donacion.success);

  const respaldo = respaldoSchema.safeParse({
    id_archivo: '33333333-3333-4333-8333-333333333333',
    id_donacion: '11111111-1111-4111-8111-111111111111',
    bucket_id: 'fge-archivos',
    ruta_objeto: 'donaciones/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.pdf',
    nombre_original: 'acta_entrega_firmada.pdf',
    mime_type: 'application/pdf',
    tamano_bytes: 102400,
    categoria: 'acta_entrega',
    tipo_respaldo: 'acta_entrega',
    descripcion: 'Acta recepcionada conforme con timbre de la escuela',
    estado_carga: 'disponible',
    version: 2,
  });
  assert.ok(respaldo.success);
});

const registroBase = {
  id_pais: '13100000-0000-4000-8000-000000000002',
  categoria: 'Servicio',
  tipo_donante: 'empresa',
  origen: 'Campaña local',
  estado: 'Comprometida',
  fecha: '2026-10-21',
  tipo_movimiento: 'recibida',
  contraparte_nombre: 'Empresa de prueba',
  descripcion: 'Horas profesionales',
  tipo_aporte: 'recurso',
};

test('donacionRegistroSchema: exige los campos obligatorios de HU20', () => {
  assert.ok(donacionRegistroSchema.safeParse(registroBase).success);

  for (const campo of ['id_pais', 'categoria', 'tipo_donante', 'origen', 'estado']) {
    const resultado = donacionRegistroSchema.safeParse({ ...registroBase, [campo]: undefined });
    assert.equal(resultado.success, false, `${campo} debería ser obligatorio`);
    assert.equal(resultado.error.issues[0].path[0], campo);
  }
  assert.equal(donacionRegistroSchema.safeParse({ ...registroBase, estado: 'Archivada' }).success, false);
  assert.equal(donacionRegistroSchema.safeParse({ ...registroBase, tipo_donante: 'gobierno' }).success, false);
});

test('donacionRegistroSchema: la categoría Otro exige su descripción y solo ella la admite', () => {
  const sinTexto = donacionRegistroSchema.safeParse({ ...registroBase, categoria: 'Otro' });
  assert.equal(sinTexto.success, false);
  assert.equal(sinTexto.error.issues[0].path[0], 'categoria_otro');
  assert.ok(donacionRegistroSchema.safeParse({ ...registroBase, categoria: 'Otro', categoria_otro: 'Transporte' }).success);
  assert.equal(donacionRegistroSchema.safeParse({ ...registroBase, categoria_otro: 'Transporte' }).success, false);
});

test('donacionRegistroSchema: cantidad y unidad van juntas o ninguna; dinero exige monto y moneda', () => {
  assert.equal(donacionRegistroSchema.safeParse({ ...registroBase, cantidad: 2 }).success, false);
  assert.equal(donacionRegistroSchema.safeParse({ ...registroBase, unidad: 'horas' }).success, false);
  assert.ok(donacionRegistroSchema.safeParse({ ...registroBase, cantidad: 2, unidad: 'horas' }).success);

  const dinero = { ...registroBase, categoria: 'Dinero', tipo_aporte: 'dinero' };
  assert.equal(donacionRegistroSchema.safeParse(dinero).success, false);
  assert.ok(donacionRegistroSchema.safeParse({ ...dinero, monto: 1000, moneda: 'CLP' }).success);
  assert.equal(donacionRegistroSchema.safeParse({ ...dinero, monto: 1000, moneda: 'clp' }).success, false);
});

test('donacionRegistroSchema: la valorización se completa entera o se omite', () => {
  assert.ok(donacionRegistroSchema.safeParse({
    ...registroBase, valor_estimado: 0, moneda_valorizacion: 'CLP', metodo_valorizacion: 'Cotización',
  }).success);
  const parcial = donacionRegistroSchema.safeParse({ ...registroBase, valor_estimado: 100 });
  assert.equal(parcial.success, false);
  assert.deepEqual(
    parcial.error.issues.map((issue) => issue.path[0]).sort(),
    ['metodo_valorizacion', 'moneda_valorizacion'],
  );
  assert.equal(donacionRegistroSchema.safeParse({
    ...registroBase, valor_estimado: -1, moneda_valorizacion: 'CLP', metodo_valorizacion: 'x',
  }).success, false);
});

test('siguienteEstado: solo permite avanzar en la secuencia autorizada', () => {
  assert.equal(siguienteEstado('Comprometida'), 'Recibida');
  assert.equal(siguienteEstado('Recibida'), 'Entregada');
  assert.equal(siguienteEstado('Entregada'), 'Cerrada');
  assert.equal(siguienteEstado('Cerrada'), null);
  assert.equal(siguienteEstado(null), 'Comprometida');
  assert.equal(siguienteEstado('Desconocido'), null);
});

test('validarRegistroDonacion: informa todos los errores a la vez, incluidas las reglas cruzadas', () => {
  const resultado = validarRegistroDonacion({
    ...registroBase, fecha: '', categoria: 'Otro', contraparte_nombre: '', valor_estimado: 5,
  });
  assert.equal(resultado.success, false);
  const campos = resultado.issues.map((issue) => issue.path[0]);
  for (const esperado of ['fecha', 'contraparte_nombre', 'categoria_otro', 'moneda_valorizacion', 'metodo_valorizacion']) {
    assert.ok(campos.includes(esperado), `falta el error de ${esperado}`);
  }
  assert.ok(validarRegistroDonacion(registroBase).success);
});


test('partes: conserva el sentido histórico y no muta los registros', async () => {
  const { partesDonacion } = await import('../../src/lib/donaciones/modelo.ts');
  const recibida = Object.freeze({ tipo_movimiento: 'recibida', contraparte_nombre: 'Empresa solidaria' });
  assert.deepEqual(partesDonacion(recibida, 'Comedor'), { entrega: 'Empresa solidaria', recibe: 'Comedor' });
  assert.deepEqual(partesDonacion({ ...recibida, tipo_movimiento: 'entregada' }, 'Comedor'), { entrega: 'Comedor', recibe: 'Empresa solidaria' });
});
