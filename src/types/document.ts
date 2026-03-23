export interface PDFDocument {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  textContent: string;
  fileBlob: Blob | null;
  libraryId: string | null;
  lastPage: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Library {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: string;
  name: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
