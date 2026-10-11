import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearEntornoDiagnostico, camposDiagnostico as campos } from '../helpers/diagnostico-entorno.mjs';
import { createApiTransport } from '../../src/lib/api/transporte.ts';
import { crearClienteDiagnostico } from '../../src/lib/diagnostico-organizacion/cliente.ts';

test('SCRUM-98: cliente → Gateway → servicio → PostgreSQL, persistencia, validación, RLS y concurrencia', async () => {
  const entorno = await crearEntornoDiagnostico();
  try {
    const { db, gatewayUrl, solicitudes } = entorno;
    const org = await entorno.crearOrganizacion();
    const id = org.id_organizacion;
    const transport = createApiTransport(gatewayUrl);
    const cliente = crearClienteDiagnostico(transport, async () => 'qa-admin');
    assert.equal(await cliente.obtener(id), null);
    const creado = await cliente.crear(id, { campos });
    assert.equal(creado.version, 1);
    assert.equal(creado.mision, campos.mision);
    assert.equal((await cliente.obtener(id)).id_diagnostico, creado.id_diagnostico);
    const guardado = (await db.query('SELECT * FROM public.diagnosticos WHERE id_organizacion=$1', [id])).rows[0];
    assert.equal(guardado.created_by, entorno.usuarios.ADMIN);
    assert.ok(guardado.fecha_diagnostico);
    const actualizado = await cliente.actualizar(id, creado.id_diagnostico, 1, { campos: { ...campos, mision: 'Misión actualizada', raciones: null, periodo_raciones: null } });
    assert.equal(actualizado.version, 2);
    assert.equal((await cliente.obtener(id)).mision, 'Misión actualizada');
    assert.equal(actualizado.raciones, null);
    await assert.rejects(cliente.actualizar(id, creado.id_diagnostico, 1, { campos }), { code: 'CONFLICTO_CONCURRENCIA', status: 409 });
    await assert.rejects(cliente.crear(id, { campos }), { code: 'DIAGNOSTICO_EXISTENTE', status: 409 });

    const ruta = `/api/v1/organizations/${id}/diagnosticos`;
    for (const body of [{ titulo: 'Modelo obsoleto', descripcion: 'No corresponde' }, { ...campos, raciones: -1 }, { ...campos, raciones: null }, { ...campos, mision: ' ' }, { ...campos, created_by: entorno.usuarios.ADMIN }]) {
      await assert.rejects(transport.request(ruta, { method: 'POST', accessToken: 'qa-admin', body }), { code: 'DATOS_INVALIDOS', status: 400 });
    }
    await assert.rejects(transport.request(`${ruta}/${creado.id_diagnostico}`, { method: 'PATCH', accessToken: 'qa-admin', body: { cambios: campos } }), { code: 'DATOS_INVALIDOS', status: 400 });
    await assert.rejects(transport.request(ruta), { code: 'SESION_REQUERIDA', status: 401 });
    const inexistente = '99999999-9999-4999-8999-999999999999';
    await assert.rejects(cliente.obtener(inexistente), { code: 'NO_ENCONTRADA', status: 404 });
    const otra = await entorno.crearOrganizacion('AR');
    await assert.rejects(cliente.actualizar(otra.id_organizacion, creado.id_diagnostico, 2, { campos }), { code: 'NO_ENCONTRADO', status: 404 });

    const coord = crearClienteDiagnostico(transport, async () => 'qa-coord');
    const local = await entorno.crearOrganizacion();
    assert.equal((await coord.crear(local.id_organizacion, { campos })).version, 1);
    await assert.rejects(coord.crear(otra.id_organizacion, { campos }), { code: 'SIN_PERMISO', status: 403 });
    const sinRol = crearClienteDiagnostico(transport, async () => 'qa-sin-rol');
    await assert.rejects(sinRol.obtener(id), { code: 'NO_ENCONTRADA', status: 404 });
    // RLS se comprueba directamente, además de la protección del servicio.
    await db.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE authenticated');
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [entorno.usuarios.SIN_ROL]);
      assert.equal((await tx.query('SELECT * FROM public.diagnosticos')).rows.length, 0);
    });
    for (const cambio of ["mision='Sin permiso'", 'version=90', `id_organizacion='${otra.id_organizacion}'`]) {
      await db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [entorno.usuarios.SIN_ROL]);
        if (cambio.startsWith('mision')) assert.equal((await tx.query(`UPDATE public.diagnosticos SET ${cambio} RETURNING *`)).rows.length, 0);
        else await assert.rejects(tx.query(`UPDATE public.diagnosticos SET ${cambio}`), { code: '42501' });
      });
    }
    await assert.rejects(db.query('UPDATE public.diagnosticos SET raciones=-1 WHERE id_organizacion=$1', [id]), { code: '23514' });
    const historial = (await db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='diagnosticos'")).rows;
    assert.ok(historial.some(h => h.tipo_accion === 'INSERT'));
    assert.ok(historial.some(h => h.tipo_accion === 'UPDATE'));
    const patch = solicitudes.find(s => s.tabla === 'diagnosticos' && s.metodo === 'PATCH');
    assert.equal(patch.params.get('version'), 'eq.1');
    assert.equal(patch.entrada.version, undefined);
    assert.equal(patch.entrada.updated_at, undefined);
    assert.equal(patch.token, 'qa-admin');
    const simultaneas = await Promise.allSettled([
      cliente.actualizar(id, creado.id_diagnostico, 2, { campos: { ...campos, mision: 'Cambio A' } }),
      cliente.actualizar(id, creado.id_diagnostico, 2, { campos: { ...campos, mision: 'Cambio B' } }),
    ]);
    assert.equal(simultaneas.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(simultaneas.find(r => r.status === 'rejected').reason.code, 'CONFLICTO_CONCURRENCIA');
    assert.equal((await cliente.obtener(id)).version, 3);
    const preflight = await db.exec(await readFile(new URL('../../../supabase/preflight-scrum-98.sql', import.meta.url), 'utf8'));
    for (const resultado of preflight.slice(2, 5)) assert.equal(resultado.rows.length, 0);
    assert.deepEqual(preflight[5].rows.map(r => r.policyname).sort(), ['diagnosticos_insert', 'diagnosticos_lectura', 'diagnosticos_update']);
  } finally { await entorno.cerrar(); }
});
