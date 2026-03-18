import '@/polyfills/promiseWithResolvers';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export { pdfjsLib };
