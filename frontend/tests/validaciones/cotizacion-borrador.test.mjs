import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leerBorrador,guardarBorrador,limpiarBorrador} from '../../src/lib/cotizacion/borrador.ts';

test('borrador conserva valores incompletos durante la navegación y se limpia explícitamente',()=>{
 const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const contacto={nombre:'Ana',apellido:'',correo:'correo incompleto',telefono:'',mensaje:'Aún escribiendo'};
 assert.equal(leerBorrador(storage),null);guardarBorrador(contacto,storage);assert.deepEqual(leerBorrador(storage),contacto);
 limpiarBorrador(storage);assert.equal(leerBorrador(storage),null);
 values.set('fge-cotizacion-contacto-v1','corrupto');assert.equal(leerBorrador(storage),null);
});
