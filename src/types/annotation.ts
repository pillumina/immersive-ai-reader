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
  tagIds?: string[];
}

export interface Note {
  id: string;
  annotationId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt?: Date;
}

export const TAG_PRESET_COLORS: string[] = [
  '#EF4444', // red - 重要
  '#F59E0B', // amber - 疑问
  '#3B82F6', // blue - 引用
  '#8B5CF6', // purple - 待整理
  '#10B981', // green
  '#EC4899', // pink
  '#6B7280', // gray
  '#0EA5E9', // sky
];

export const DEFAULT_TAG_COLOR = '#6B7280';

export const PRESET_TAGS: Array<{ name: string; color: string }> = [
  { name: '重要', color: '#EF4444' },
  { name: '疑问', color: '#F59E0B' },
  { name: '引用', color: '#3B82F6' },
  { name: '待整理', color: '#8B5CF6' },
];
