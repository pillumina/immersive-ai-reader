import { useState, useCallback, useRef } from 'react';
import { PDFDocument, Library } from '@/types/document';
import { validatePDFFile } from '@/lib/pdf/validator';
import { extractTextFromPDF, checkPageLimit } from '@/lib/pdf/parser';
import { BackendDocument, documentCommands, libraryCommands } from '@/lib/tauri';
import { formatFileSize } from '@/lib/utils/file';

export function usePDF() {
  const [currentDocument, setCurrentDocument] = useState<PDFDocument | null>(null);
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCleanedRef = useRef(false);

  const mapBackendDoc = useCallback((doc: BackendDocument, fileBlob: Blob | null): PDFDocument => ({
    id: doc.id,
    fileName: doc.file_name,
    filePath: doc.file_path || '',
    fileSize: doc.file_size,
    pageCount: doc.page_count,
    textContent: doc.text_content || '',
    fileBlob,
    libraryId: doc.library_id ?? null,
    lastPage: doc.last_page ?? 1,
    createdAt: new Date(doc.created_at),
    updatedAt: new Date(doc.updated_at),
  }), []);

  const readFileBlobFromPath = useCallback(async (filePath: string, fallbackName: string) => {
    if (!filePath) return null;
    const bytes = await documentCommands.readPDFFile(filePath);
    return new File([new Uint8Array(bytes)], fallbackName || 'document.pdf', { type: 'application/pdf' });
  }, []);

  const loadDocuments = useCallback(async () => {
    let docs = await documentCommands.getAll();

    // One-time cleanup for historical bad records and duplicates.
    if (!hasCleanedRef.current) {
      const idsToDelete = new Set<string>();
      const seenKeys = new Set<string>();

      for (const doc of docs) {
        const filePath = doc.file_path?.trim();
        if (!filePath) {
          idsToDelete.add(doc.id);
          continue;
        }
        const key = `path:${filePath}`;
        if (seenKeys.has(key)) {
          idsToDelete.add(doc.id);
          continue;
        }
        seenKeys.add(key);
      }

      if (idsToDelete.size > 0) {
        await Promise.all(Array.from(idsToDelete).map((id) => documentCommands.delete(id)));
        docs = await documentCommands.getAll();
      }
      hasCleanedRef.current = true;
    }

    const frontendDocs: PDFDocument[] = docs
      .filter((doc) => !!doc.file_path?.trim())
      .map((doc) => mapBackendDoc(doc, null));
    setDocuments(frontendDocs);
    return docs.filter((doc) => !!doc.file_path?.trim());
  }, [mapBackendDoc]);

  const uploadPDF = useCallback(async (file: File, sourcePath: string = '', libraryId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate file
      const validation = validatePDFFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Check page limit
      const pageCount = await checkPageLimit(file);

      // Extract text with timeout fallback so UI won't be stuck indefinitely.
      let textContent = '';
      try {
        textContent = await Promise.race<string>([
          extractTextFromPDF(file),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Text extraction timeout')), 45000)
          ),
        ]);
      } catch (error) {
        console.warn('Text extraction skipped:', error);
      }

      // Create document via Tauri command
      const doc = await documentCommands.create({
        file_name: file.name,
        file_path: sourcePath,
        file_size: file.size,
        page_count: pageCount,
        text_content: textContent,
        library_id: libraryId,
      });

      // Convert to frontend format
      const frontendDoc: PDFDocument = mapBackendDoc(doc, file);

      setCurrentDocument(frontendDoc);
      await loadDocuments();

      return frontendDoc;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload PDF';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadDocuments, mapBackendDoc]);

  const openPDFFile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Call Tauri command to open file dialog
      const result = await documentCommands.openPDFFile();

      if (!result) {
        setIsLoading(false);
        return null;
      }

      const [path, data] = result;
      if (!path) {
        throw new Error('Invalid file path returned by Tauri dialog');
      }
      const fileName = path.split(/[\\/]/).pop() || 'document.pdf';
      const file = new File(
        [new Uint8Array(data)],
        fileName,
        { type: 'application/pdf' }
      );

      // Upload the file
      return await uploadPDF(file, path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open PDF file';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [uploadPDF]);

  const selectDocument = useCallback(async (id: string) => {
    try {
      const doc = await documentCommands.getById(id);
      if (doc) {
        if (!doc.file_path?.trim()) {
          throw new Error('该文档缺少原始文件路径，无法恢复，请重新上传');
        }
        const fileBlob = await readFileBlobFromPath(doc.file_path, doc.file_name).catch((err) => {
          console.warn('Failed to restore file from disk:', err);
          return null;
        });
        if (!fileBlob) {
          throw new Error('无法读取原始文件，可能已被移动或删除，请重新上传');
        }
        const frontendDoc: PDFDocument = mapBackendDoc(doc, fileBlob);
        setCurrentDocument(frontendDoc);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select document';
      setError(message);
      console.error('Failed to select document:', err);
    }
  }, [mapBackendDoc, readFileBlobFromPath]);

  const restoreLastDocument = useCallback(async () => {
    try {
      const docs = await loadDocuments();
      if (docs.length === 0) return null;

      for (const doc of docs) {
        if (!doc.file_path?.trim()) continue;
        const fileBlob = await readFileBlobFromPath(doc.file_path, doc.file_name).catch((err) => {
          console.warn('Failed to restore latest file from disk:', err);
          return null;
        });
        if (!fileBlob) continue;
        const frontendDoc = mapBackendDoc(doc, fileBlob);
        setCurrentDocument(frontendDoc);
        return frontendDoc;
      }

      setError('未找到可恢复的历史文档，请重新上传');
      return null;
    } catch (err) {
      console.error('Failed to restore last document:', err);
      return null;
    }
  }, [loadDocuments, mapBackendDoc, readFileBlobFromPath]);

  const deleteDocumentById = useCallback(async (id: string) => {
    try {
      await documentCommands.delete(id);
      const docs = await loadDocuments();
      if (currentDocument?.id === id) {
        setCurrentDocument(null);
        if (docs.length > 0) {
          await restoreLastDocument();
        }
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  }, [currentDocument, loadDocuments, restoreLastDocument]);

  const relinkDocument = useCallback(async (id: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await documentCommands.openPDFFile();
      if (!result) return null;

      const [path, data] = result;
      if (!path) {
        throw new Error('Invalid file path returned by Tauri dialog');
      }

      const fileName = path.split(/[\\/]/).pop() || 'document.pdf';
      const file = new File([new Uint8Array(data)], fileName, { type: 'application/pdf' });

      await documentCommands.updateDocumentFilePath(id, path, fileName, file.size);

      const updated = await documentCommands.getById(id);
      if (!updated) {
        throw new Error('Document not found after relink');
      }
      const frontendDoc = mapBackendDoc(updated, file);
      setCurrentDocument(frontendDoc);
      await loadDocuments();
      return frontendDoc;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to relink document';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadDocuments, mapBackendDoc]);

  const updateDocumentLibrary = useCallback(async (id: string, libraryId: string | null) => {
    try {
      await documentCommands.updateLibrary(id, libraryId);
      await loadDocuments();
      if (currentDocument?.id === id) {
        const updated = await documentCommands.getById(id);
        if (updated) {
          const frontendDoc = mapBackendDoc(updated, currentDocument.fileBlob);
          setCurrentDocument(frontendDoc);
        }
      }
    } catch (err) {
      console.error('Failed to update document library:', err);
    }
  }, [currentDocument, loadDocuments, mapBackendDoc]);

  // Library management
  const loadLibraries = useCallback(async (): Promise<Library[]> => {
    const libs = await libraryCommands.getAll();
    return libs.map((lib) => ({
      id: lib.id,
      name: lib.name,
      color: lib.color,
      createdAt: new Date(lib.created_at),
      updatedAt: new Date(lib.updated_at),
    }));
  }, []);

  const createLibrary = useCallback(async (name: string, color?: string): Promise<Library> => {
    const lib = await libraryCommands.create(name, color);
    return {
      id: lib.id,
      name: lib.name,
      color: lib.color,
      createdAt: new Date(lib.created_at),
      updatedAt: new Date(lib.updated_at),
    };
  }, []);

  const updateLibrary = useCallback(async (id: string, name: string, color: string) => {
    await libraryCommands.update(id, name, color);
  }, []);

  const deleteLibrary = useCallback(async (id: string) => {
    await libraryCommands.delete(id);
  }, []);

  return {
    currentDocument,
    documents,
    isLoading,
    error,
    uploadPDF,
    openPDFFile,
    loadDocuments,
    restoreLastDocument,
    selectDocument,
    deleteDocument: deleteDocumentById,
    relinkDocument,
    updateDocumentLibrary,
    loadLibraries,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    formatFileSize,
  };
}
