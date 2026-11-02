import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoActas } from '../helpers/actas-entorno.mjs';
import { crearClienteActas } from '../../src/lib/actas-reunion/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';

test('Actas: cliente → Gateway → servicio → PostgreSQL, asociaciones, RLS, concurrencia y atomicidad', async () => {
  const env = await crearEntornoActas();
  try {
    const { organizacion:org, planes, acciones } = await env.fixture();
    const http = createApiTransport(env.gatewayUrl);
    const cliente = crearClienteActas(http,async()=> 'qa-admin');
    const campos = { id_plan:planes[0].id_plan,id_accion:acciones[0].id_accion,fecha_reunion:'2026-10-08',asistentes:['QA ADMIN'],asistentes_externos:'',objetivo:'Coordinar actividades',observaciones:'' };
    const c = { descripcion:'Entregar informe',responsable_nombre:'Ana',responsable_contacto:'ana@example.invalid',fecha_limite:'2026-12-01',observaciones:'' };
    assert.deepEqual(await cliente.obtener(org.id_organizacion),[]);
    const catalogo = await cliente.catalogo(org.id_organizacion);
    assert.equal(catalogo.puede_gestionar,true);
    assert.equal(catalogo.planes.length,2);
    assert.deepEqual(catalogo.asistentes,['QA ADMIN','QA COORD']);
    const creada = await cliente.crear(org.id_organizacion,{ campos,compromisos:[c,{...c,descripcion:'Segundo acuerdo'}] });
    assert.equal(creada.compromisos.length,2);
    assert.equal((await cliente.obtener(org.id_organizacion))[0].id_acta,creada.id_acta);
    assert.equal((await cliente.detalle(org.id_organizacion,creada.id_acta)).compromisos[0].responsable_contacto,c.responsable_contacto);
    const updated = await cliente.actualizar(org.id_organizacion,creada.id_acta,1,{ campos:{...campos,objetivo:'Actualizada',id_accion:''} });
    assert.equal(updated.version,2); assert.equal(updated.id_accion,''); assert.equal(updated.compromisos.length,2);
    await assert.rejects(cliente.actualizar(org.id_organizacion,creada.id_acta,1,{ campos }),{ code:'CONFLICTO_CONCURRENCIA',status:409 });
    const otra = await env.fixture('AR');
    await assert.rejects(cliente.crear(org.id_organizacion,{ campos:{...campos,id_plan:otra.planes[0].id_plan} }),{ code:'PLAN_NO_CORRESPONDE' });
    await assert.rejects(cliente.crear(org.id_organizacion,{ campos:{...campos,id_accion:acciones[1].id_accion} }),{ code:'ACCION_NO_CORRESPONDE' });
    await assert.rejects(cliente.detalle(otra.organizacion.id_organizacion,creada.id_acta),{ code:'RESPUESTA_INVALIDA' });
    const coord = crearClienteActas(http,async()=> 'qa-coord');
    assert.equal((await coord.catalogo(otra.organizacion.id_organizacion)).puede_gestionar,false);
    assert.equal((await coord.crear(org.id_organizacion,{campos})).version,1);
    await assert.rejects(coord.crear(otra.organizacion.id_organizacion,{ campos:{...campos,id_plan:otra.planes[0].id_plan,id_accion:''} }),{ code:'SIN_PERMISO',status:403 });
    const sinRol = crearClienteActas(http,async()=> 'qa-sin-rol');
    await assert.rejects(sinRol.obtener(org.id_organizacion),{ code:'NO_ENCONTRADA' });
    await assert.rejects(sinRol.catalogo(org.id_organizacion),{ code:'NO_ENCONTRADA' });
    await assert.rejects(http.request('/api/v1/meeting-minutes'),{ status:401 });
    for(const body of [{}, {...campos,id_organizacion:org.id_organizacion,objetivo:''}, {...campos,id_organizacion:org.id_organizacion,asistentes:['QA','qa']}]) {
      await assert.rejects(http.request('/api/v1/meeting-minutes',{ method:'POST',accessToken:'qa-admin',body }),{ code:'DATOS_INVALIDOS',status:400 });
    }
    // Se fuerza un fallo SQL del segundo compromiso tras insertar el acta y el primero.
    const antes = Number((await env.db.query('SELECT count(*) FROM public.actas')).rows[0].count);
    await assert.rejects(env.como('qa-admin',tx=>tx.query('SELECT public.crear_acta_completa($1::jsonb,$2::jsonb)',[
      JSON.stringify({...campos,id_organizacion:org.id_organizacion}),JSON.stringify([c,{...c,responsable_contacto:''}]),
    ])),{code:'23514'});
    assert.equal(Number((await env.db.query('SELECT count(*) FROM public.actas')).rows[0].count),antes);
    await assert.rejects(env.como('qa-admin',tx=>tx.query('UPDATE public.actas SET id_organizacion=$1 WHERE id_acta=$2',[otra.organizacion.id_organizacion,creada.id_acta])),{code:'42501'});
    await assert.rejects(env.como('qa-admin',tx=>tx.query('UPDATE public.actas SET id_plan=$1 WHERE id_acta=$2',[otra.planes[0].id_plan,creada.id_acta])),{code:'23503'});
    await env.como('qa-sin-rol',async tx => assert.equal((await tx.query('SELECT * FROM public.actas')).rows.length,0));
    await assert.rejects(env.db.transaction(async tx => { await tx.exec('SET LOCAL ROLE anon'); await tx.query('SELECT * FROM public.actas'); }),{code:'42501'});
    const simultaneas = await Promise.allSettled([cliente.actualizar(org.id_organizacion,creada.id_acta,2,{campos}),cliente.actualizar(org.id_organizacion,creada.id_acta,2,{campos:{...campos,objetivo:'Otra sesión'}})]);
    assert.equal(simultaneas.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(simultaneas.find(r=>r.status==='rejected').reason.code,'CONFLICTO_CONCURRENCIA');
    assert.ok((await env.db.query("SELECT * FROM fge_private.historial_cambios WHERE tabla_afectada='actas' AND tipo_accion='UPDATE' AND id_usuario=$1",[env.usuarios.ADMIN])).rows.length>0);
    const escrituras = env.solicitudes.filter(s=>s.metodo==='PATCH');
    assert.ok(escrituras.every(s=>s.params.has('version') && s.entrada.version===undefined));
  } finally { await env.cerrar(); }
});
