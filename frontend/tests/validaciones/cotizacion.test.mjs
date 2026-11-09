import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararSolicitud,cantidadSchema} from '../../src/lib/cotizacion/modelo.ts';
import {crearClienteCotizacion} from '../../src/lib/cotizacion/cliente.ts';
const contacto={nombre:' Ana ',apellido:' Pérez ',correo:'ana@example.org',telefono:'+56 912345678',mensaje:''};
const items=[{id_producto:'1',cantidad:2.5}];
test('contrato: teléfono obligatorio, cantidades decimales y mensaje opcional omitido',()=>{assert.deepEqual(prepararSolicitud(contacto,items),{nombre:'Ana',apellido:'Pérez',nombre_solicitante:'Ana Pérez',correo:'ana@example.org',telefono:contacto.telefono,items});});
test('rechaza selección vacía, duplicados, cantidades inválidas y contacto incompleto',()=>{
 for(const cantidad of [0,-1,NaN,Infinity])assert.equal(cantidadSchema.safeParse(cantidad).success,false);
 assert.throws(()=>prepararSolicitud(contacto,[]));assert.throws(()=>prepararSolicitud(contacto,[...items,...items]));assert.throws(()=>prepararSolicitud({...contacto,apellido:''},items));assert.throws(()=>prepararSolicitud({...contacto,correo:'invalido'},items));
 for(const telefono of ['', '   ', null, undefined])assert.throws(()=>prepararSolicitud({...contacto,telefono},items));
});
test('cliente anónimo no acepta una confirmación incompleta ni un error HTTP',async()=>{
 const c=crearClienteCotizacion('https://api',async(url,init)=>{assert.equal(init.headers.authorization,undefined);assert.equal(init.method,'POST');return Response.json({ok:true,data:{quote:{estado:'solicitada'}}});});
 await assert.rejects(c.enviar(contacto,items),{code:'CONFIRMACION_INVALIDA'});
 const error=crearClienteCotizacion('',async()=>Response.json({ok:false,error:{code:'ERROR',message:'falló'}},{status:500}));await assert.rejects(error.enviar(contacto,items),{code:'ERROR'});
});
