export interface PDFDocument {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  textContent: string;
  fileBlob: Blob;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
