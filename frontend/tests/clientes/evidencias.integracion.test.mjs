import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoEvidencias } from '../helpers/evidencias-entorno.mjs';
import { crearClienteEvidencias } from '../../src/lib/evidencias/cliente.ts';

test('Evidencias: cliente → Gateway → Backend → SQL/RLS y Storage simulado', async t => {
  const env=await crearEntornoEvidencias();
  try {
    const {accion,plan}=await env.fixture();
    const extranjera=(await env.fixture('AR')).accion;
    const client=crearClienteEvidencias(env.gatewayUrl,async()=>'qa-admin');
    const coord=crearClienteEvidencias(env.gatewayUrl,async()=>'qa-coord');
    const file=new File(['%PDF-1.7 evidencia QA'],'qa.pdf',{type:'application/pdf'});
    const input={id_accion:accion.id_accion,origen:'Integración QA',descripcion:'Archivo sintético',nombre_original:file.name,
      mime_type:file.type,tamano_bytes:file.size,consentimiento:{consentimiento_declarado:true,declaracion_consentimiento:'Archivo QA sin personas.'}};
    let item;
    await t.test('el resolver funciona con los permisos mínimos de las migraciones',async()=>{
      const missing='ffffffff-ffff-4fff-8fff-ffffffffffff';
      const resolved=await env.como('qa-publication',tx=>tx.query('SELECT * FROM public.obtener_archivo_evidencia_publicada($1)',[missing]));
      assert.deepEqual(resolved.rows,[]);
      // La prueba no debe ocultar un GRANT faltante concediendo acceso a todas las tablas.
      await assert.rejects(env.como('qa-publication',tx=>tx.query('SELECT correo FROM public.organizaciones LIMIT 0')),{code:'42501'});
      await assert.rejects(env.como('qa-publication',tx=>tx.query('SELECT descripcion FROM public.evidencias LIMIT 0')),{code:'42501'});
    });
    await t.test('reserva y carga conservan Acción, archivo, autor y sesión',async()=>{
      assert.deepEqual(await client.listar(accion.id_accion),[]);
      item=await client.reservar(input);
      assert.equal(item.incorporado_por,env.usuarios.ADMIN);
      item=await client.subir(item,file);
      assert.equal(item.estado_carga,'disponible');
      assert.equal(await (await client.descargar(item)).text(),await file.text());
      const stored=(await env.db.query('SELECT * FROM public.evidencias WHERE id_evidencia=$1',[item.id_evidencia])).rows[0];
      assert.equal(stored.id_accion,accion.id_accion);
      assert.equal(env.objetos.get(`${stored.bucket_id}/${stored.ruta_objeto}`).toString(),await file.text());
      assert.ok(env.solicitudes.filter(r=>r.path.includes('/storage/')).every(r=>r.token==='qa-admin'));
      assert.equal((await client.listar(accion.id_accion)).length,1);
    });
    await t.test('privacidad, permisos territoriales y función exclusiva del Backend',async()=>{
      assert.equal((await fetch(client.enlacePublico(item))).status,404);
      assert.equal((await fetch(`${env.gatewayUrl}/api/v1/evidences/${item.id_evidencia}/file`)).status,401);
      await assert.rejects(coord.reservar({...input,id_accion:extranjera.id_accion}),{code:'SIN_PERMISO'});
      const noRole=crearClienteEvidencias(env.gatewayUrl,async()=>'qa-sin-rol');
      await assert.rejects(noRole.obtener(accion.id_accion,item.id_evidencia),{code:'NO_ENCONTRADA'});
      await assert.rejects(env.como('qa-admin',tx=>tx.query('SELECT * FROM public.obtener_archivo_evidencia_publicada($1)',[item.id_evidencia])),{code:'42501'});
      await assert.rejects(env.db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM public.obtener_archivo_evidencia_publicada($1)',[item.id_evidencia]);}),{code:'42501'});
      assert.notEqual((await fetch(`${env.supabaseUrl}/storage/v1/object/public/fge-evidencias/${accion.id_accion}/${item.id_evidencia}`)).status,200);
    });
    await t.test('publicación institucional entrega bytes sin URLs ni credenciales y se retira',async()=>{
      const anterior=item;
      item=await client.actualizar(item,{estado_publicacion:'publicada'});
      const response=await fetch(client.enlacePublico(item));
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(response.headers.get('location'),null);
      assert.equal(await response.text(),await file.text());
      assert.equal((await fetch(client.enlacePublico(item),{method:'POST'})).status,405);
      await assert.rejects(client.actualizar(anterior,{descripcion:'Versión antigua'}),{code:'CONFLICTO_CONCURRENCIA'});
      await env.db.query('UPDATE public.planes SET archived_at=now() WHERE id_plan=$1',[plan.id_plan]);
      assert.equal((await fetch(client.enlacePublico(item))).status,404);
      await env.db.query('UPDATE public.planes SET archived_at=NULL WHERE id_plan=$1',[plan.id_plan]);
      item=await client.actualizar(item,{estado_publicacion:'retirada',consentimiento:{consentimiento_declarado:false,declaracion_consentimiento:'Retiro QA'}});
      assert.equal((await fetch(client.enlacePublico(item))).status,404);
      assert.equal(await (await client.descargar(item)).text(),await file.text());
    });
    await t.test('reintento tras fallo de confirmación no duplica ni confirma otro archivo',async()=>{
      let pending=await client.reservar(input);
      env.fallarSiguienteConfirmacion();
      await assert.rejects(client.subir(pending,file));
      const different=new File(['%PDF-1.7 evidencia XX'],'qa.pdf',{type:file.type});
      assert.equal(different.size,file.size);
      await assert.rejects(client.subir(pending,different),{code:'ARCHIVO_DISTINTO'});
      pending=await client.subir(pending,file);
      assert.equal(pending.estado_carga,'disponible');
      assert.equal((await client.listar(accion.id_accion)).length,2);
      assert.equal(env.objetos.size,2);
    });
  } finally {await env.cerrar();}
});
