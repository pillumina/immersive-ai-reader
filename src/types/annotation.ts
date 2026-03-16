import { BoundingBox } from './document';

export interface Annotation {
  id: string;
  documentId: string;
  pageNumber: number;
  type: 'highlight';
  color: string;
  position: BoundingBox;
  text: string;
  createdAt: Date;
}

export interface Note {
  id: string;
  annotationId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
