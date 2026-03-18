export interface PDFDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  textContent: string;
  fileBlob: Blob | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
