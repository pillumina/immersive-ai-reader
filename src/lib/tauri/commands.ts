import { invoke } from '@tauri-apps/api/core';
import { Message } from '@/types/conversation';

function unwrapInvokeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    if (typeof anyErr.message === 'string') return anyErr.message;
    try {
      return JSON.stringify(anyErr);
    } catch {
      return 'Unknown invoke error';
    }
  }
  return 'Unknown invoke error';
}

export interface BackendDocument {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  page_count: number;
  text_content: string | null;
  library_id: string | null;
  last_page: number;
  created_at: string;
  updated_at: string;
}

/** Lightweight document record for list views — excludes text_content. */
export interface BackendDocumentSummary {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  page_count: number;
  library_id: string | null;
  last_page: number;
  created_at: string;
  updated_at: string;
}

export interface BackendLibrary {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface BackendTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface BackendAnnotation {
  id: string;
  document_id: string;
  page_number: number;
  type: string;
  color: string;
  position_x: number;
  position_y: number;
  position_width: number;
  position_height: number;
  text: string | null;
  created_at: string;
}

export interface BackendConversation {
  id: string;
  document_id: string;
  created_at: string;
  updated_at: string;
}

export interface BackendMessage {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIConnectivityResult {
  ok: boolean;
  status_code: number;
  latency_ms: number;
  message: string;
}

export interface AIStreamStartResult {
  stream_id: string;
}

// Document commands
export const documentCommands = {
  create: async (request: {
    file_name: string;
    file_path: string;
    file_size: number;
    page_count: number;
    text_content: string;
    library_id?: string;
  }): Promise<BackendDocument> => {
    return await invoke<BackendDocument>('create_document', { request });
  },

  getById: async (id: string): Promise<BackendDocument | null> => {
    return await invoke<BackendDocument | null>('get_document', { id });
  },

  getAll: async (): Promise<BackendDocumentSummary[]> => {
    return await invoke<BackendDocumentSummary[]>('get_all_documents');
  },

  getByLibrary: async (libraryId: string): Promise<BackendDocumentSummary[]> => {
    return await invoke<BackendDocumentSummary[]>('get_documents_by_library', { libraryId });
  },

  delete: async (id: string): Promise<void> => {
    await invoke('delete_document', { id });
  },

  openPDFFile: async (): Promise<[string, number[]] | null> => {
    return await invoke<[string, number[]] | null>('open_pdf_file');
  },

  readPDFFile: async (path: string): Promise<number[]> => {
    return await invoke<number[]>('read_pdf_file', { path });
  },

  updateDocumentFilePath: async (id: string, filePath: string, fileName: string, fileSize: number): Promise<void> => {
    await invoke('update_document_file_path', {
      id,
      filePath,
      fileName,
      fileSize,
    });
  },

  updateLibrary: async (id: string, libraryId: string | null): Promise<void> => {
    await invoke('update_document_library', { id, libraryId });
  },

  updateLastPage: async (id: string, lastPage: number): Promise<void> => {
    await invoke('update_document_last_page', { id, lastPage });
  },
};

// Library commands
export const libraryCommands = {
  create: async (name: string, color?: string): Promise<BackendLibrary> => {
    return await invoke<BackendLibrary>('create_library', {
      request: { name, color },
    });
  },

  getById: async (id: string): Promise<BackendLibrary | null> => {
    return await invoke<BackendLibrary | null>('get_library', { id });
  },

  getAll: async (): Promise<BackendLibrary[]> => {
    return await invoke<BackendLibrary[]>('get_all_libraries');
  },

  update: async (id: string, name: string, color: string): Promise<void> => {
    await invoke('update_library', { id, name, color });
  },

  delete: async (id: string): Promise<void> => {
    await invoke('delete_library', { id });
  },
};

// Tag commands
export const tagCommands = {
  getAll: async (): Promise<BackendTag[]> => {
    return await invoke<BackendTag[]>('get_all_tags');
  },

  search: async (prefix: string): Promise<BackendTag[]> => {
    return await invoke<BackendTag[]>('search_tags', { prefix });
  },

  getByDocument: async (documentId: string): Promise<BackendTag[]> => {
    return await invoke<BackendTag[]>('get_document_tags', { documentId });
  },

  addToDocument: async (documentId: string, tagName: string, color?: string): Promise<void> => {
    await invoke('add_tag_to_document', { documentId, tagName, color });
  },

  removeFromDocument: async (documentId: string, tagName: string): Promise<void> => {
    await invoke('remove_tag_from_document', { documentId, tagName });
  },

  delete: async (id: string): Promise<void> => {
    await invoke('delete_tag', { id });
  },

  // Annotation-level tag commands
  getByAnnotation: async (annotationId: string): Promise<BackendTag[]> => {
    return await invoke<BackendTag[]>('get_annotation_tags', { annotationId });
  },

  getAnnotationTagsBatch: async (annotationIds: string[]): Promise<Record<string, BackendTag[]>> => {
    if (annotationIds.length === 0) return {};
    return await invoke<Record<string, BackendTag[]>>('get_annotation_tags_batch', { annotationIds });
  },

  setAnnotationTags: async (annotationId: string, tagNames: string[], colors: string[]): Promise<void> => {
    await invoke('set_annotation_tags', { annotationId, tagNames, colors });
  },

  addToAnnotation: async (annotationId: string, tagName: string, color?: string): Promise<void> => {
    await invoke('add_tag_to_annotation', { annotationId, tagName, color });
  },

  removeFromAnnotation: async (annotationId: string, tagName: string): Promise<void> => {
    await invoke('remove_tag_from_annotation', { annotationId, tagName });
  },
};

// Annotation commands
export const annotationCommands = {
  create: async (request: {
    document_id: string;
    page_number: number;
    annotation_type: string;
    color: string;
    position_x: number;
    position_y: number;
    position_width: number;
    position_height: number;
    text?: string;
  }): Promise<BackendAnnotation> => {
    return await invoke('create_annotation', { request });
  },

  getByDocument: async (documentId: string): Promise<BackendAnnotation[]> => {
    return await invoke('get_annotations_by_document', { documentId });
  },

  delete: async (id: string): Promise<void> => {
    await invoke('delete_annotation', { id });
  },

  updatePosition: async (id: string, positionX: number, positionY: number): Promise<void> => {
    await invoke('update_annotation_position', {
      id,
      positionX,
      positionY,
    });
  },

  updateText: async (id: string, text: string): Promise<void> => {
    await invoke('update_annotation_text', { id, text });
  },
};

// Conversation commands
export const conversationCommands = {
  getOrCreate: async (documentId: string): Promise<BackendConversation> => {
    return await invoke<BackendConversation>('get_conversation', { documentId });
  },

  addMessage: async (request: {
    conversation_id: string;
    role: string;
    content: string;
  }): Promise<number> => {
    return await invoke('add_message', { request });
  },

  getMessages: async (conversationId: string): Promise<BackendMessage[]> => {
    return await invoke<BackendMessage[]>('get_messages', { conversationId });
  },
};

// AI commands
export const aiCommands = {
  sendMessage: async (
    provider: string,
    endpoint: string,
    model: string,
    apiKey: string,
    documentId: string,
    message: string,
    history: Message[]
  ): Promise<string> => {
    try {
      return await invoke<string>('send_chat_message', {
        provider,
        endpoint,
        model,
        apiKey,
        documentId,
        message,
        history,
      });
    } catch (error) {
      throw new Error(unwrapInvokeError(error));
    }
  },

  startStreamMessage: async (
    provider: string,
    endpoint: string,
    model: string,
    apiKey: string,
    documentId: string,
    message: string,
    history: Message[]
  ): Promise<AIStreamStartResult> => {
    try {
      return await invoke<AIStreamStartResult>('start_stream_chat', {
        provider,
        endpoint,
        model,
        apiKey,
        documentId,
        message,
        history,
      });
    } catch (error) {
      throw new Error(unwrapInvokeError(error));
    }
  },

  stopStreamMessage: async (streamId: string): Promise<void> => {
    try {
      await invoke('stop_stream_chat', { streamId });
    } catch (error) {
      throw new Error(unwrapInvokeError(error));
    }
  },

  saveApiKey: async (provider: string, apiKey: string): Promise<void> => {
    await invoke('save_api_key', { provider, apiKey });
  },

  getApiKey: async (provider: string): Promise<string> => {
    return await invoke<string>('get_api_key', { provider });
  },

  deleteApiKey: async (provider: string): Promise<void> => {
    await invoke('delete_api_key', { provider });
  },

  testConnectivity: async (
    provider: string,
    endpoint: string,
    model: string,
    apiKey: string
  ): Promise<AIConnectivityResult> => {
    try {
      return await invoke<AIConnectivityResult>('test_ai_connectivity', {
        provider,
        endpoint,
        model,
        apiKey,
      });
    } catch (error) {
      throw new Error(unwrapInvokeError(error));
    }
  },
};
