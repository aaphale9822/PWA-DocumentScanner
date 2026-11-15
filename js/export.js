// export.js – Handles exporting the scanned document in various formats
// Uses pdf-lib (loaded via script tag) for PDF generation. For image formats,
// it converts stored page blobs to the requested type using a temporary canvas.

export async function exportDocument(format) {
  // Retrieve current document ID from session storage (set by main.js)
  const docId = sessionStorage.getItem('currentDocId');
  if (!docId) {
    alert('No active document to export.');
    return;
  }
  const pages = await getPagesForDocument(docId);
  if (!pages.length) {
    alert('Document has no pages.');
    return;
  }
  switch (format) {
    case 'pdf':
      await exportPDF(pages);
      break;
    case 'jpeg':
    case 'png':
    case 'tiff':
      await exportImages(pages, format);
      break;
    default:
      console.warn('Unsupported export format:', format);
  }
}

async function exportPDF(pages) {
  const { PDFDocument } = PDFLib; // PDFLib global from pdf-lib script
  const pdfDoc = await PDFDocument.create();
  for (const page of pages) {
    const imgBytes = await page.blob.arrayBuffer();
    const img = await pdfDoc.embedJpg(imgBytes); // Assume JPEG blobs; pdf-lib also supports PNG
    const { width, height } = img.scale(1);
    const pdfPage = pdfDoc.addPage([width, height]);
    pdfPage.drawImage(img, { x: 0, y: 0, width, height });
  }
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

async function exportImages(pages, format) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const zip = new JSZip(); // We'll use JSZip via CDN (assumed loaded globally)
  let index = 1;
  for (const page of pages) {
    const img = await createImageBitmap(page.blob);
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/tiff';
    const blob = await new Promise(res => canvas.toBlob(res, mime, 0.92));
    const filename = `page_${String(index).padStart(3, '0')}.${format}`;
    zip.file(filename, blob);
    index++;
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document_${format}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// Helper imports – they are re-exported from db.js for convenience
import { getPagesForDocument } from './db.js';
