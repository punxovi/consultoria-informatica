import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crearClienteSolicitudes} from '../../src/lib/solicitudes-cotizacion/cliente.ts';
const s={id_solicitud:'1',nombre_solicitante:'Ana',correo:'ana@example.org',telefono:null,mensaje:null,created_at:'2026-11-04T12:00:00Z',estado:'solicitada',version:1,estados_permitidos:['en_gestion'],items:[{id_producto:'p',nombre_producto:'Mesa',unidad_medida:'unidad',cantidad:2,organizacion:{id_organizacion:'o',nombre:'Org',pais:{id_pais:'cl',nombre:'Chile'}}}]};
test('cliente usa Bearer y versión y acepta confirmación coherente',async()=>{
 let peticion;const c=crearClienteSolicitudes('https://api',async()=>'jwt',async(url,init)=>{peticion={url,init};return Response.json({ok:true,data:{request:{...s,estado:'en_gestion',version:2}}});});
 assert.equal((await c.actualizar(s,'en_gestion')).version,2);assert.equal(peticion.init.headers.authorization,'Bearer jwt');assert.equal(peticion.init.method,'PATCH');assert.deepEqual(JSON.parse(peticion.init.body),{version_esperada:1,estado:'en_gestion'});
});
test('no envía transiciones que el servidor no autorizó',async()=>{
 let llamadas=0;const c=crearClienteSolicitudes('',async()=>'jwt',async()=>{llamadas++;throw new Error();});await assert.rejects(c.actualizar(s,'cerrada'));assert.equal(llamadas,0);
});
test('rechaza listado inválido, detalle de otra solicitud y confirmaciones sin cambio',async()=>{
 const client=data=>crearClienteSolicitudes('',async()=>'jwt',async()=>Response.json({ok:true,data}));
 await assert.rejects(client({requests:[{...s,items:[{}]}]}).listar(),{code:'RESPUESTA_INVALIDA'});
 await assert.rejects(client({request:s}).obtener('otro'),{code:'RESPUESTA_INVALIDA'});
 await assert.rejects(client({request:s}).actualizar(s,'en_gestion'),{code:'RESPUESTA_INVALIDA'});
});
