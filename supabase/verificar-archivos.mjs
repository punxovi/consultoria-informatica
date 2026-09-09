// Revisión estática; no es un parser SQL ni ejecuta PostgreSQL.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(join(root,'migrations')).filter(f=>f.endsWith('.sql')).sort();
assert.equal(files.length,5,'Se esperaban cinco migraciones');
const sql = files.map(f=>readFileSync(join(root,'migrations',f),'utf8'));
for (let i=0;i<files.length;i++) {
 assert.match(files[i],/^\d{14}_fge_.+\.sql$/);
 assert.match(sql[i],/BEGIN;/);
 assert.match(sql[i],/COMMIT;/);
 assert.ok(!/DROP\s+(TABLE|SCHEMA|DATABASE)/i.test(sql[i]),'Sin borrado de estructuras existentes');
 // Equilibrio de paréntesis ignorando comentarios y literales.
 const plain=sql[i].replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 let depth=0;
 for(const c of plain) { if(c==='(')depth++; if(c===')')depth--; assert.ok(depth>=0,'Paréntesis'); }
 assert.equal(depth,0,'Paréntesis equilibrados');
}
const allSql=sql.join('\n');
const tables=[...allSql.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)];
assert.equal(tables.length,26,'26 tablas public');
const known=new Set();
for(const [,name,body] of tables) {
 assert.ok(!known.has(name),'Tabla única');
 known.add(name); // Permitir FK a la propia tabla.
 for(const m of body.matchAll(/REFERENCES public\.(\w+)\((\w+)\)/g)) {
  assert.ok(known.has(m[1]),'FK creada después de su destino: '+name+' -> '+m[1]);
  const target=tables.find(t=>t[1]===m[1]);
  assert.ok(new RegExp('\\b'+m[2]+'\\s+uuid').test(target[2]),'FK UUID compatible');
 }
 assert.ok(allSql.includes('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;'),'RLS '+name);
 assert.ok(allSql.includes('REVOKE ALL ON TABLE public.'+name+' FROM PUBLIC, anon, authenticated;'),'Cierre '+name);
 assert.ok(allSql.includes('BEFORE INSERT OR UPDATE ON public.'+name),'Sellado '+name);
 assert.ok(allSql.includes('AFTER INSERT OR UPDATE OR DELETE ON public.'+name),'Auditoría '+name);
}
const body=n=>tables.find(t=>t[1]===n)[2];
assert.match(body('programas'),/id_organizacion uuid NOT NULL/);
assert.ok(!body('planes').includes('id_organizacion'));
assert.ok(!known.has('organizacion_programas'));
const filesBody=body('archivos');
const destinations=['id_organizacion','id_informacion_legal','id_programa','id_accion','id_donacion'];
for(const d of destinations) assert.ok(filesBody.includes(d+' uuid REFERENCES'),'FK anulable: '+d);
assert.match(filesBody,/num_nonnulls\(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion\) = 1/);
assert.ok(!filesBody.includes('entidad_tipo'));
assert.ok(!sql.join('\n').match(/CREATE POLICY/i),'Sin políticas inventadas');
assert.ok(!sql.join('\n').match(/SECURITY DEFINER/i),'Sin funciones privilegiadas');
assert.ok(sql[2].includes("'fge-archivos',false"));
assert.ok(!sql[2].includes('INSERT INTO public.programas'));
assert.match(sql[3],/ADD COLUMN id_producto uuid REFERENCES public.productos/);
assert.match(sql[3],/num_nonnulls\(id_organizacion,id_informacion_legal,id_programa,id_accion,id_donacion,id_producto\) = 1/);
const tests=readdirSync(join(root,'tests/database')).filter(f=>f.endsWith('.sql')).map(f=>readFileSync(join(root,'tests/database',f),'utf8')).join('\n');
assert.match(tests,/ROLLBACK;/);
assert.match(tests,/SET LOCAL ROLE anon;/);
assert.match(tests,/SET LOCAL ROLE authenticated;/);
const assertions=(tests.match(/SELECT (?:has_table|hasnt_column|hasnt_table|fk_ok|throws_ok|lives_ok|is|ok)\(/g)||[]).length;
console.log(JSON.stringify({migraciones:files.length,tablas_public:tables.length,tablas_auditoria:1,aserciones_pgtap_preparadas:assertions,revision_estatica:'correcta',nota:'Este script no ejecuta PostgreSQL; usar supabase test db --local'},null,2));
