'use client';

import { useState, useCallback } from 'react';
import { PDFDocument } from '@/types/document';
import { validatePDFFile } from '@/lib/pdf/validator';
import { extractTextFromPDF, checkPageLimit } from '@/lib/pdf/parser';
import { saveDocument, getDocument, getAllDocuments, deleteDocument } from '@/lib/storage/documents';
import { openDB } from '@/lib/storage/indexeddb';
import { generateId } from '@/lib/utils/crypto';
import { formatFileSize } from '@/lib/utils/file';

export function usePDF() {
  const [currentDocument, setCurrentDocument] = useState<PDFDocument | null>(null);
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPDF = useCallback(async (file: File) => {
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

      // Extract text
      const textContent = await extractTextFromPDF(file);

      // Create document object
      const doc: PDFDocument = {
        id: generateId(),
        fileName: file.name,
        fileSize: file.size,
        pageCount,
        textContent,
        fileBlob: file,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to IndexedDB
      const db = await openDB();
      await saveDocument(db, doc);

      setCurrentDocument(doc);
      await loadDocuments();

      return doc;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload PDF';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const db = await openDB();
      const docs = await getAllDocuments(db);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  const selectDocument = useCallback(async (id: string) => {
    try {
      const db = await openDB();
      const doc = await getDocument(db, id);
      if (doc) {
        setCurrentDocument(doc);
      }
    } catch (err) {
      console.error('Failed to select document:', err);
    }
  }, []);

  const deleteDocumentById = useCallback(async (id: string) => {
    try {
      const db = await openDB();
      await deleteDocument(db, id);
      await loadDocuments();
      if (currentDocument?.id === id) {
        setCurrentDocument(null);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  }, [currentDocument, loadDocuments]);

  return {
    currentDocument,
    documents,
    isLoading,
    error,
    uploadPDF,
    loadDocuments,
    selectDocument,
    deleteDocument: deleteDocumentById,
    formatFileSize,
  };
}
