import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrarCatalogo,urlImagen,imagenPredeterminada,caracteristicasPublicas} from '../../src/lib/catalogo/modelo.ts';
import {crearClienteCatalogo} from '../../src/lib/catalogo/cliente.ts';
const item={id_producto:'1',nombre:'Mesa',descripcion:'Madera',unidad_medida:'unidad',tipo_item:'producto',organizacion:{id_organizacion:'a',nombre:'A',pais:{id_pais:'cl',nombre:'Chile'}}};
test('filtra publicados y criterios combinados',()=>{
 const items=[item,{...item,publicado:false},{...item,archived_at:'2026-11-01'}];assert.equal(filtrarCatalogo(items,'cl','a').length,1);assert.equal(filtrarCatalogo(items,'pe','a').length,0);
});
test('imágenes seguras y características públicas sin precios ni stock',()=>{
 for(const url of [null,'javascript:alert(1)','data:text/html,x','https://user:pass@host/x'])assert.equal(urlImagen(url),imagenPredeterminada);
 assert.equal(urlImagen('https://example.test/foto.png'),'https://example.test/foto.png');
 assert.deepEqual(caracteristicasPublicas({...item,caracteristicas:{precio:1,stock:2,material:'Madera'}}),[['Material','Madera']]);
});
test('cliente anónimo conserva contrato actual y rechaza errores de forma',async()=>{
 const cliente=crearClienteCatalogo('https://api',async(url,options)=>{assert.equal(url,'https://api/api/v1/public/catalog');assert.equal(options.headers.authorization,undefined);return Response.json({ok:true,data:{items:[item]}});});
 assert.equal((await cliente.listar()).length,1);
 await assert.rejects(crearClienteCatalogo('',async()=>Response.json({ok:true,data:{items:[{}]}})).listar(),{code:'RESPUESTA_INVALIDA'});
});
