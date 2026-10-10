import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const cache = new Map<string, Promise<PDFDocumentProxy>>();

/** Loads (and caches) a PDF document. A failed load is evicted so it can be retried later. */
export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let doc = cache.get(url);
  if (!doc) {
    doc = pdfjs.getDocument({ url }).promise;
    doc.catch(() => cache.delete(url));
    cache.set(url, doc);
  }
  return doc;
}
