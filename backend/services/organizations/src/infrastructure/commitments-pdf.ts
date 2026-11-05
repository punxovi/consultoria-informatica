import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { CommitmentsPdfRenderer } from '../domain/commitments-pdf.ts';

const assets = new URL('../../assets/', import.meta.url);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 200;
const civilDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

/** Renderizador sin acceso a sesión, base de datos ni red. */
export const generateCommitmentsPdf: CommitmentsPdfRenderer = async document => {
  let regular: Buffer;
  let bold: Buffer;
  try {
    regular = readFileSync(new URL('LiberationSans-Regular.ttf', assets));
    bold = readFileSync(new URL('LiberationSans-Bold.ttf', assets));
  } catch (error) {
    throw new ServiceError('PDF_PREPARACION_FALLIDA', 'No fue posible cargar las fuentes del PDF.', 500, error);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, autoFirstPage: false,
      info: { Title: 'Compromisos de la organización', Author: 'Fundación Gestionar Esperanzas' } });
    const chunks: Buffer[] = [];
    let size = 0;
    let pages = 0;
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
      doc.on('pageAdded', () => {
        if (++pages > MAX_PAGES) {
          throw new ServiceError('PDF_DEMASIADO_GRANDE', 'El PDF supera 200 páginas; filtra por acta.', 413);
        }
        doc.font('bold').fontSize(10).fillColor('#4C4688')
          .text('FUNDACIÓN GESTIONAR ESPERANZAS', 48, 25, { lineBreak: false });
        doc.x = 48;
        doc.y = 55;
        doc.font('regular').fontSize(10).fillColor('#242424');
      });
      doc.addPage();
      doc.font('bold').fontSize(20).text('Compromisos');
      doc.moveDown(0.5).font('regular').fontSize(11)
        .text(`Organización: ${document.organization.nombre}`)
        .text(`Identificador: ${document.organization.id_organizacion}`);
      if (document.context.id_acta) doc.text(`Acta seleccionada: ${document.context.id_acta}`);
      doc.text(`Total de compromisos: ${document.commitments.length}`).moveDown();

      for (const [index, item] of document.commitments.entries()) {
        // Mantiene el título y el inicio del contenido juntos; PDFKit pagina los textos extensos.
        if (doc.y > doc.page.height - 160) doc.addPage();
        doc.font('bold').fontSize(12).fillColor('#4C4688').text(`Compromiso ${index + 1}`);
        doc.font('regular').fontSize(10).fillColor('#242424');
        const fields: Array<[string, string]> = [
          ['Descripción', item.descripcion],
          ['Responsable', item.responsable_nombre],
          ['Fecha límite de cumplimiento', civilDate(item.fecha_limite)],
          ['Estado', item.estado === 'cumplido' ? 'Cumplido' : 'Pendiente'],
          ['Acta de origen', item.id_acta],
        ];
        if (item.cumplido_at) {
          const completedAt = new Date(item.cumplido_at).toISOString();
          fields.push(['Cumplimiento registrado (UTC)', `${civilDate(completedAt)} ${completedAt.slice(11, 19)}`]);
        }
        if (item.responsable_contacto) fields.push(['Contacto', item.responsable_contacto]);
        if (item.observaciones) fields.push(['Información adicional', item.observaciones]);
        for (const [label, value] of fields) {
          doc.text(`${label}: ${value}`, { width: doc.page.width - 96, lineGap: 3 });
          doc.moveDown(0.3);
        }
        doc.moveDown();
      }
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.font('regular').fontSize(8).fillColor('#666666').text(`Página ${i + 1} de ${range.count}`,
          48, doc.page.height - 32, { lineBreak: false });
      }
      doc.end();
    } catch (error) {
      doc.destroy(error instanceof Error ? error : new Error('Error generando PDF'));
    }
  });
};
