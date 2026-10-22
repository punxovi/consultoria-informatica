import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ReportDocument, ReportSection } from '../domain/report-document.ts';

const assets = {
  regular: fileURLToPath(new URL('../../assets/LiberationSans-Regular.ttf',import.meta.url)),
  bold: fileURLToPath(new URL('../../assets/LiberationSans-Bold.ttf',import.meta.url)),
  logo: fileURLToPath(new URL('../../assets/logo-fge.png',import.meta.url)),
};
let fonts: {regular:Buffer;bold:Buffer} | undefined;
const brand={primary:'#4c4688',green:'#199d6b',ink:'#1a1a1a',muted:'#706e78',light:'#f4f2f9',line:'#e5e5e5'};

/** Solo recibe el documento preparado. No tiene acceso a módulos, sesiones ni red. */
export async function generateReportPdf(report:ReportDocument):Promise<Buffer> {
  try {
    fonts ??= {regular:readFileSync(assets.regular),bold:readFileSync(assets.bold)};
    readFileSync(assets.logo); // Falla antes de preparar una respuesta si falta el recurso aprobado.
  } catch {
    throw new ServiceError('PDF_PREPARACION_FALLIDA','No fue posible cargar los recursos institucionales del PDF.',500);
  }
  return new Promise<Buffer>((resolve,reject)=>{
    const doc=new PDFDocument({autoFirstPage:false,bufferPages:true,compress:true,
      info:{Title:report.title,Author:'Fundación Gestionar Esperanza',Subject:'Reporte institucional HU22',
        CreationDate:new Date(report.generatedAt),ModDate:new Date(report.generatedAt)}});
    const chunks:Buffer[]=[];let byteCount=0;
    doc.on('data',(chunk:Buffer)=>{
      byteCount+=chunk.length;
      if(byteCount>12*1024*1024)doc.destroy(new ServiceError('REPORTE_DEMASIADO_GRANDE','El PDF supera el tamaño permitido.',413));
      else chunks.push(chunk);
    });
    doc.on('error',(error:unknown)=>reject(error instanceof ServiceError?error:new ServiceError('PDF_GENERACION_FALLIDA','No fue posible generar el documento PDF.',500)));
    doc.on('end',()=>{
      const bytes=Buffer.concat(chunks);
      if(bytes.subarray(0,5).toString()!=='%PDF-'||!bytes.subarray(-64).toString().includes('%%EOF')) {
        reject(new ServiceError('PDF_GENERACION_FALLIDA','El archivo generado no es un PDF válido.',500));return;
      }
      resolve(bytes);
    });
    try {
      doc.registerFont('regular',fonts!.regular).registerFont('bold',fonts!.bold).font('regular');
      // Evita emitir cuadrados o perder caracteres silenciosamente en una fuente.
      const seen=new Set<number>();
      const printed=[report.title,report.generatedAt,report.period.start,report.period.end,...report.filters,
        ...report.summary.flatMap(item=>[item.label,item.value]),
        ...report.sections.flatMap(section=>[section.title,...section.columns,...section.rows.flat(),section.note??''])];
      for(const character of printed.join('\n')) {
        const code=character.codePointAt(0)!;
        if([9,10,13].includes(code)||seen.has(code))continue;
        seen.add(code);
        if(!doc._font.font.hasGlyphForCodePoint(code))throw new ServiceError('PDF_CARACTER_NO_SOPORTADO','El reporte contiene caracteres que la tipografía institucional no puede representar.',422);
      }
      const margin=40, width=515.28, bottom=794, lineHeight=11;
      let y=0,pageCount=0;
      const destination=report.destination==='interno'?'Uso interno':report.destination==='donante'?'Reporte para donantes':'Reporte externo';
      const line=(value:string,x:number,top:number,size=8.5,font='regular',color=brand.ink)=>{
        doc.font(font).fontSize(size).fillColor(color).text(value,x,top,{lineBreak:false});
      };
      const page=()=>{
        if(++pageCount>400)throw new ServiceError('REPORTE_DEMASIADO_GRANDE','El reporte supera el límite de páginas; reduce los filtros.',413);
        doc.addPage({size:'A4',margins:{top:0,bottom:0,left:0,right:0}});
        // Recorta solo el margen transparente al componer; el PNG oficial no se modifica.
        doc.save().rect(margin,23,225,64).clip().image(assets.logo,margin,-53,{width:225}).restore();
        line('REPORTE INSTITUCIONAL',350,35,9,'bold',brand.primary);
        line(destination,350,51,9,'regular',brand.muted);
        doc.moveTo(margin,92).lineTo(margin+width,92).lineWidth(1).strokeColor(brand.line).stroke();
        y=108;
      };
      const wrap=(value:string,cellWidth:number,size=8.5,font='regular'):string[]=>{
        doc.font(font).fontSize(size);
        const output:string[]=[];
        for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')) {
          let current='';
          for(const word of paragraph.split(/[ \t]+/)) {
            const trial=current?`${current} ${word}`:word;
            if(doc.widthOfString(trial)<=cellWidth){current=trial;continue;}
            if(current){output.push(current);current='';}
            let remaining=Array.from(word);
            while(remaining.length && doc.widthOfString(remaining.join(''))>cellWidth) {
              let low=1,high=remaining.length;
              while(low<high){const mid=Math.ceil((low+high)/2);if(doc.widthOfString(remaining.slice(0,mid).join(''))<=cellWidth)low=mid;else high=mid-1;}
              output.push(remaining.slice(0,low).join(''));remaining=remaining.slice(low);
            }
            current=remaining.join('');
          }
          output.push(current);
        }
        return output;
      };
      const block=(value:string,size=9,color=brand.muted)=>{
        for(const valueLine of wrap(value,width,size)){
          if(y+14>bottom)page();
          line(valueLine,margin,y,size,'regular',color);y+=14;
        }
      };
      page();
      line('Reporte consolidado',margin,y,25,'bold',brand.primary);y+=30;
      line('de intervenciones',margin,y,25,'bold',brand.primary);y+=43;
      doc.roundedRect(margin,y,width,42,5).fill(brand.light);
      line('PERÍODO CONSULTADO',margin+12,y+7,8,'bold',brand.primary);
      line(`${report.period.start}  /  ${report.period.end}`,margin+12,y+22,11,'bold');y+=57;
      const cardWidth=(width-20)/3;
      report.summary.forEach((metric,index)=>{
        const x=margin+index*(cardWidth+10);
        doc.roundedRect(x,y,cardWidth,61,5).fill(brand.light);
        let size=23;doc.font('bold').fontSize(size);
        while(doc.widthOfString(metric.value)>cardWidth-20&&size>9)doc.fontSize(--size);
        line(metric.value,x+10,y+8,size,'bold',brand.primary);
        line(metric.label,x+10,y+40,8,'regular',brand.muted);
      });y+=75;
      block('* Importe recibido del consolidado. La fuente no informa su moneda.',8);
      block(`Generado: ${new Date(report.generatedAt).toISOString().replace('T',' ').replace('.000Z',' UTC')}`,8);
      y+=10;line('Filtros aplicados',margin,y,12,'bold');y+=21;
      report.filters.forEach(filter=>block(filter,8.5));y+=15;
      if(report.destination!=='interno'){block('Información agregada: se omiten nombres, identificadores y datos personales.',9,brand.green);y+=10;}

      function table(section:ReportSection,index:number):void {
        const weights=section.columns.length===3?[.46,.32,.22]:section.columns.length===4?[.28,.36,.18,.18]:section.columns.length===5?[.29,.23,.18,.15,.15]:[.73,.27];
        const widths=weights.map(w=>w*width);
        const heading=(continuation=false)=>{
          if(y+65>bottom)page();
          line(`${String(index+1).padStart(2,'0')}  ${section.title}${continuation?' (continuación)':''}`,margin,y,12,'bold',brand.primary);y+=23;
          const headers=section.columns.map((column,i)=>wrap(column,widths[i]-10,8,'bold'));
          const height=Math.max(...headers.map(lines=>lines.length))*10+12;
          doc.rect(margin,y,width,height).fill(brand.primary);
          let x=margin;
          headers.forEach((lines,i)=>{lines.forEach((value,j)=>line(value,x+5,y+5+j*10,8,'bold','#ffffff'));x+=widths[i];});
          y+=height;
        };
        if(y+90>bottom)page();
        heading();
        if(section.rows.length===0){doc.rect(margin,y,width,31).fill(brand.light);line('Sin resultados para los filtros del reporte.',margin+8,y+10,9,'regular',brand.muted);y+=31;}
        section.rows.forEach((row,rowIndex)=>{
          const cells=row.map((value,i)=>wrap(value,widths[i]-10));
          const length=Math.max(1,...cells.map(lines=>lines.length));
          let offset=0;
          while(offset<length) {
            let available=Math.floor((bottom-y-10)/lineHeight);
            if(available<1){page();heading(true);available=Math.floor((bottom-y-10)/lineHeight);}
            const count=Math.min(available,length-offset),height=count*lineHeight+10;
            doc.rect(margin,y,width,height).fill(rowIndex%2===0?'#fafafa':'#ffffff');
            let x=margin;
            cells.forEach((lines,i)=>{lines.slice(offset,offset+count).forEach((value,j)=>line(value,x+5,y+5+j*lineHeight));x+=widths[i];});
            y+=height;offset+=count;
            doc.moveTo(margin,y).lineTo(margin+width,y).lineWidth(.3).strokeColor(brand.line).stroke();
            if(offset<length){page();heading(true);}
          }
        });
        y+=9;if(section.note)block(section.note,8);y+=16;
      }
      report.sections.forEach(table);
      const range=doc.bufferedPageRange();
      for(let i=range.start;i<range.start+range.count;i++){
        doc.switchToPage(i);
        doc.moveTo(margin,806).lineTo(margin+width,806).lineWidth(.5).strokeColor(brand.line).stroke();
        line(`FGE | ${destination}`,margin,815,8,'regular',brand.muted);
        line(`${i+1} / ${range.count}`,515,815,8,'regular',brand.muted);
      }
      doc.end();
    } catch(error) {
      doc.destroy(error instanceof ServiceError?error:new ServiceError('PDF_GENERACION_FALLIDA','No fue posible generar el documento PDF.',500));
    }
  });
}
