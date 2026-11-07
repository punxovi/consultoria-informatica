// Artefactos de QA con datos sintéticos. No consulta Supabase.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generateCommitmentsPdf} from '../backend/services/organizations/src/infrastructure/commitments-pdf.ts';
const directory=resolve(process.argv[2]);await mkdir(directory,{recursive:true});
const org='17800000-0000-4000-8000-000000000001',acta='17800000-0000-4000-8000-000000000002';
const base={organization:{id_organizacion:org,nombre:'Fundación Niñez y Esperanza',pais:{nombre:'Chile'}},context:{id_organizacion:org,id_acta:acta},actas:{[acta]:'Acta del 01/11/2026: Acuerdos de colaboración'},generatedAt:'2026-11-06T12:00:00Z'};
const item={id_compromiso:'17800000-0000-4000-8000-000000000003',id_organizacion:org,id_acta:acta,descripcion:'Entregar útiles escolares y coordinar una capacitación comunitaria.',responsable_nombre:'María Muñoz',responsable_contacto:'qa@example.invalid',fecha_limite:'2026-11-20',estado:'pendiente',observaciones:'Información adicional de seguimiento.',cumplido_at:null,archived_at:null};
const cases=[['compromisos-normal.pdf',{...base,commitments:[item,{...item,id_compromiso:'17800000-0000-4000-8000-000000000004',estado:'cumplido',cumplido_at:'2026-11-03T15:00:00Z'},{...item,id_compromiso:'17800000-0000-4000-8000-000000000005',fecha_limite:'2026-10-01'}]}],
  ['compromisos-largos.pdf',{...base,commitments:Array.from({length:12},(_,i)=>({...item,descripcion:`Acuerdo ${i+1}. `+'Descripción con acentos: niñez, educación y colaboración. '.repeat(30),observaciones:'Información adicional de seguimiento. '.repeat(40)}))}],
  ['compromisos-acta-multilinea.pdf',{...base,actas:{[acta]:'Acta del 01/11/2026: '+'Punto acordado\n'.repeat(50)},commitments:[item]}]];
for(const[name,document]of cases){const bytes=await generateCommitmentsPdf(document);await writeFile(resolve(directory,name),bytes);console.log(JSON.stringify({file:name,bytes:bytes.length}));}
