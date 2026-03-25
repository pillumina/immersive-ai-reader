import { useState, useEffect, useRef } from 'react';
import { pdfjsLib } from '@/lib/pdf/pdfjs';

const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_SCALE = THUMBNAIL_WIDTH / 612; // 612pt = standard letter width in pt

interface ThumbnailResult {
  thumbnails: Map<number, string>; // pageNumber -> data URL
  isLoading: boolean;
}

export function usePDFThumbnails(
  file: File | Blob | null,
  pageCount: number
): ThumbnailResult {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(false);
  const cacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!file || pageCount === 0) {
      setThumbnails(new Map());
      cacheRef.current.clear();
      return;
    }

    // Return early if all thumbnails already cached
    if (cacheRef.current.size === pageCount && cacheRef.current.has(1)) {
      setThumbnails(new Map(cacheRef.current));
      return;
    }

    abortRef.current = false;
    setIsLoading(true);

    const renderThumbnail = async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<void> => {
      if (abortRef.current) return;

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

      if (!abortRef.current) {
        cacheRef.current.set(pageNum, dataUrl);
        setThumbnails(new Map(cacheRef.current));
      }
    };

    (async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        if (abortRef.current) return;

        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (abortRef.current) return;

        // Render first page immediately, rest in parallel batches of 4
        await renderThumbnail(pdfDoc, 1);

        const BATCH_SIZE = 4;
        for (let batchStart = 2; batchStart <= pageCount; batchStart += BATCH_SIZE) {
          if (abortRef.current) break;
          const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, pageCount);
          await Promise.all(
            Array.from({ length: batchEnd - batchStart + 1 }, (_, i) =>
              renderThumbnail(pdfDoc, batchStart + i)
            )
          );
        }
      } catch (err) {
        console.warn('Thumbnail rendering error:', err);
      } finally {
        if (!abortRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      abortRef.current = true;
    };
  }, [file, pageCount]);

  return { thumbnails, isLoading };
}
