import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { CommitmentsPdfDocument, CommitmentsPdfRenderer, PdfCommitment } from '../domain/commitments-pdf.ts';

// Misma composición institucional que el reporte consolidado (Insights):
// logo y encabezado en cada página, tarjetas de resumen y tabla con cabecera violeta.
const assets = {
  regular: fileURLToPath(new URL('../../assets/LiberationSans-Regular.ttf', import.meta.url)),
  bold: fileURLToPath(new URL('../../assets/LiberationSans-Bold.ttf', import.meta.url)),
  logo: fileURLToPath(new URL('../../assets/logo-fge.png', import.meta.url)),
};
const brand = { primary: '#4c4688', green: '#199d6b', pink: '#c81e5b', amber: '#946200', ink: '#1a1a1a', muted: '#706e78', light: '#f4f2f9', line: '#e5e5e5' };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 200;
const civilDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

type Estado = 'Pendiente' | 'Vencido' | 'Cumplido';
function estado(item: PdfCommitment, hoy: string): Estado {
  if (item.estado === 'cumplido') return 'Cumplido';
  return item.fecha_limite < hoy ? 'Vencido' : 'Pendiente';
}

/** Renderizador sin acceso a sesión, base de datos ni red. */
export const generateCommitmentsPdf: CommitmentsPdfRenderer = async (document: CommitmentsPdfDocument) => {
  let regular: Buffer;
  let bold: Buffer;
  try {
    regular = readFileSync(assets.regular);
    bold = readFileSync(assets.bold);
    readFileSync(assets.logo); // Falla antes de componer si falta el recurso institucional.
  } catch (error) {
    throw new ServiceError('PDF_PREPARACION_FALLIDA', 'No fue posible cargar los recursos institucionales del PDF.', 500, error);
  }
  const generado = new Date(document.generatedAt ?? Date.now());
  const hoy = generado.toISOString().slice(0, 10);
  const nombreActa = (id: string) => document.actas?.[id] ?? 'Acta de origen';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, compress: true,
      info: { Title: `Compromisos · ${document.organization.nombre}`, Author: 'Fundación Gestionar Esperanzas',
        Subject: 'Compromisos de la organización', CreationDate: generado, ModDate: generado } });
    const chunks: Buffer[] = [];
    let size = 0;
    doc.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) doc.destroy(new ServiceError('PDF_DEMASIADO_GRANDE', 'El PDF supera el límite de 8 MiB.', 413));
      else chunks.push(chunk);
    });
    doc.on('error', (error: unknown) => reject(error instanceof ServiceError ? error :
      new ServiceError('PDF_GENERACION_FALLIDA', 'No fue posible generar el PDF de compromisos.', 500, error)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      doc.registerFont('regular', regular).registerFont('bold', bold).font('regular');
      const margin = 40, width = 515.28, bottom = 794, lineHeight = 11;
      let y = 0, pages = 0;
      const porActa = Boolean(document.context.id_acta);
      const contexto = porActa ? nombreActa(document.context.id_acta!) : 'Todos los compromisos de la organización';
      const line = (value: string, x: number, top: number, size = 8.5, font = 'regular', color = brand.ink) => {
        doc.font(font).fontSize(size).fillColor(color).text(value, x, top, { lineBreak: false });
      };
      const wrap = (value: string, cellWidth: number, size = 8.5, font = 'regular'): string[] => {
        doc.font(font).fontSize(size);
        const output: string[] = [];
        for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
          let current = '';
          for (const word of paragraph.split(/[ \t]+/)) {
            const trial = current ? `${current} ${word}` : word;
            if (doc.widthOfString(trial) <= cellWidth) { current = trial; continue; }
            if (current) { output.push(current); current = ''; }
            let remaining = Array.from(word);
            while (remaining.length && doc.widthOfString(remaining.join('')) > cellWidth) {
              let low = 1, high = remaining.length;
              while (low < high) { const mid = Math.ceil((low + high) / 2); if (doc.widthOfString(remaining.slice(0, mid).join('')) <= cellWidth) low = mid; else high = mid - 1; }
              output.push(remaining.slice(0, low).join('')); remaining = remaining.slice(low);
            }
            current = remaining.join('');
          }
          output.push(current);
        }
        return output;
      };
      const page = () => {
        if (++pages > MAX_PAGES) throw new ServiceError('PDF_DEMASIADO_GRANDE', 'El PDF supera 200 páginas; filtra por acta.', 413);
        doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        // Recorta solo el margen transparente del PNG oficial, igual que el reporte.
        doc.save().rect(margin, 23, 225, 64).clip().image(assets.logo, margin, -53, { width: 225 }).restore();
        line('COMPROMISOS', 350, 35, 9, 'bold', brand.primary);
        line(wrap(document.organization.nombre, 205, 9)[0] ?? '', 350, 51, 9, 'regular', brand.muted);
        doc.moveTo(margin, 92).lineTo(margin + width, 92).lineWidth(1).strokeColor(brand.line).stroke();
        y = 108;
      };

      page();
      line(porActa ? 'Compromisos' : 'Compromisos de la', margin, y, 25, 'bold', brand.primary); y += 30;
      line(porActa ? 'del acta' : 'organización', margin, y, 25, 'bold', brand.primary); y += 43;

      // Recuadro de contexto: organización, país y alcance del documento.
      const cajaOrg = wrap(document.organization.nombre + (document.organization.pais?.nombre ? ` · ${document.organization.pais.nombre}` : ''), width - 24, 11, 'bold');
      const cajaCtx = wrap(contexto, width - 24, 9);
      const bloques = [
        { titulo: 'ORGANIZACIÓN', lineas: cajaOrg, size: 11, font: 'bold', paso: 14 },
        { titulo: porActa ? 'ACTA DE REUNIÓN' : 'CONTENIDO', lineas: cajaCtx, size: 9, font: 'regular', paso: 12 },
      ];
      for (const bloque of bloques) {
        let offset = 0;
        while (offset < bloque.lineas.length) {
          if (y + 34 + bloque.paso > bottom) page();
          const cantidad = Math.min(bloque.lineas.length - offset, Math.floor((bottom - y - 34) / bloque.paso));
          const alto = 34 + cantidad * bloque.paso;
          doc.roundedRect(margin, y, width, alto, 5).fill(brand.light);
          line(bloque.titulo + (offset ? ' (continuación)' : ''), margin + 12, y + 8, 8, 'bold', brand.primary);
          bloque.lineas.slice(offset, offset + cantidad).forEach((texto, i) =>
            line(texto, margin + 12, y + 23 + i * bloque.paso, bloque.size, bloque.font));
          y += alto + 8;
          offset += cantidad;
          if (offset < bloque.lineas.length) page();
        }
      }
      if (y + 110 > bottom) page();

      // Tarjetas de resumen con el estado de cumplimiento.
      const conteo = { Pendiente: 0, Vencido: 0, Cumplido: 0 } as Record<Estado, number>;
      for (const item of document.commitments) conteo[estado(item, hoy)]++;
      const tarjetas: Array<[string, string, string]> = [
        [String(document.commitments.length), 'Compromisos', brand.primary],
        [String(conteo.Pendiente), 'Pendientes', brand.amber],
        [String(conteo.Vencido), 'Vencidos', brand.pink],
        [String(conteo.Cumplido), 'Cumplidos', brand.green],
      ];
      const cardWidth = (width - 30) / 4;
      tarjetas.forEach(([valor, etiqueta, color], i) => {
        const x = margin + i * (cardWidth + 10);
        doc.roundedRect(x, y, cardWidth, 58, 5).fill(brand.light);
        line(valor, x + 10, y + 8, 22, 'bold', color);
        line(etiqueta, x + 10, y + 38, 8, 'regular', brand.muted);
      });
      y += 72;
      const generadoTexto = `${civilDate(generado.toISOString())} ${generado.toISOString().slice(11, 16)} UTC`;
      line(`Generado: ${generadoTexto}. «Vencido» indica un compromiso pendiente cuya fecha límite ya pasó.`, margin, y, 8, 'regular', brand.muted);
      y += 24;

      // Tabla de compromisos.
      const columnas = ['N°', 'Acuerdo', 'Responsable', 'Fecha límite', 'Estado'];
      const widths = [0.06, 0.44, 0.22, 0.13, 0.15].map(w => w * width);
      const heading = (continuacion = false) => {
        if (y + 65 > bottom) page();
        line(`01  Detalle de compromisos${continuacion ? ' (continuación)' : ''}`, margin, y, 12, 'bold', brand.primary); y += 23;
        doc.rect(margin, y, width, 22).fill(brand.primary);
        let x = margin;
        columnas.forEach((titulo, i) => { line(titulo, x + 5, y + 7, 8, 'bold', '#ffffff'); x += widths[i]; });
        y += 22;
      };
      heading();
      document.commitments.forEach((item, index) => {
        const est = estado(item, hoy);
        const detalle = [`Acta: ${nombreActa(item.id_acta)}`];
        if (item.observaciones) detalle.push(`Observaciones: ${item.observaciones}`);
        const responsable = [item.responsable_nombre];
        if (item.responsable_contacto) responsable.push(item.responsable_contacto);
        const estadoTexto = est === 'Cumplido' && item.cumplido_at ? `Cumplido\nel ${civilDate(item.cumplido_at)}` : est;
        // La descripción va en negrita: se mide con esa fuente para que no invada la columna vecina.
        const descripcion = wrap(item.descripcion, widths[1] - 10, 8.5, 'bold');
        const celdas = [
          wrap(String(index + 1), widths[0] - 10),
          [...descripcion, ...wrap(detalle.join('\n'), widths[1] - 10)],
          wrap(responsable.join('\n'), widths[2] - 10),
          wrap(civilDate(item.fecha_limite), widths[3] - 10),
          wrap(estadoTexto, widths[4] - 10, 8.5, 'bold'),
        ];
        const colorEstado = est === 'Cumplido' ? brand.green : est === 'Vencido' ? brand.pink : brand.amber;
        const total = Math.max(1, ...celdas.map(l => l.length));
        let offset = 0;
        while (offset < total) {
          let disponibles = Math.floor((bottom - y - 10) / lineHeight);
          if (disponibles < 1) { page(); heading(true); disponibles = Math.floor((bottom - y - 10) / lineHeight); }
          const cantidad = Math.min(disponibles, total - offset), alto = cantidad * lineHeight + 10;
          doc.rect(margin, y, width, alto).fill(index % 2 === 0 ? '#fafafa' : '#ffffff');
          let x = margin;
          celdas.forEach((lineas, i) => {
            lineas.slice(offset, offset + cantidad).forEach((valor, j) => {
              // La primera línea del acuerdo es la descripción: se destaca sobre acta y observaciones.
              const destacado = i === 1 && offset + j < descripcion.length;
              line(valor, x + 5, y + 5 + j * lineHeight, 8.5, i === 4 || destacado ? 'bold' : 'regular',
                i === 4 ? colorEstado : i === 1 && !destacado ? brand.muted : brand.ink);
            });
            x += widths[i];
          });
          y += alto; offset += cantidad;
          doc.moveTo(margin, y).lineTo(margin + width, y).lineWidth(0.3).strokeColor(brand.line).stroke();
          if (offset < total) { page(); heading(true); }
        }
      });

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.moveTo(margin, 806).lineTo(margin + width, 806).lineWidth(0.5).strokeColor(brand.line).stroke();
        line(`FGE | ${porActa ? 'Compromisos del acta' : 'Compromisos de la organización'}`, margin, 815, 8, 'regular', brand.muted);
        line(`${i + 1} / ${range.count}`, 515, 815, 8, 'regular', brand.muted);
      }
      doc.end();
    } catch (error) {
      doc.destroy(error instanceof ServiceError ? error : new ServiceError('PDF_GENERACION_FALLIDA', 'No fue posible generar el PDF de compromisos.', 500));
    }
  });
};
