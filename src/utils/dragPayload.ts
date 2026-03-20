/**
 * Module-level drag state for text/note attachments.
 * Used across components without React props drilling.
 */
export type AttachmentType = 'text' | 'note';

export interface DragAttachmentPayload {
  type: AttachmentType;
  content: string;
  page?: number;
}

export const dragPayload = {
  payload: null as DragAttachmentPayload | null,
  isDragging: false,
};
