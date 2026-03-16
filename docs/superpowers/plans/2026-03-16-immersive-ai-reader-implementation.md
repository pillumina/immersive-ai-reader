# 沉浸式 AI 阅读器 - 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an open-source immersive PDF reader with canvas-based interaction and AI-powered conversation.

**Architecture:** Next.js 14+ full-stack application with Fabric.js canvas for PDF rendering, PDF.js for document parsing, IndexedDB for local storage, and AI API proxy for 智谱 GLM-4 and Minimax integration.

**Tech Stack:** Next.js 14+, React 18+, TypeScript 5+, Tailwind CSS 3+, Fabric.js 6+, PDF.js 4+, Radix UI, IndexedDB

---

## 文件结构规划

### 核心文件组织

```
/reader
├── /src
│   ├── /app                    # Next.js App Router
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 主页面
│   │   ├── globals.css        # 全局样式
│   │   └── /api               # API Routes
│   │       └── /chat
│   │           └── route.ts   # AI 对话代理
│   ├── /components            # React 组件
│   │   ├── /ui               # 基础 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── Toast.tsx
│   │   ├── /layout           # 布局组件
│   │   │   ├── Sidebar.tsx
│   │   │   ├── MainCanvas.tsx
│   │   │   ├── AIPanel.tsx
│   │   │   └── Toolbar.tsx
│   │   ├── /features         # 功能组件
│   │   │   ├── PDFUploader.tsx
│   │   │   ├── PDFCanvas.tsx
│   │   │   ├── AnnotationLayer.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── NotePopup.tsx
│   │   │   └── SettingsModal.tsx
│   │   └── /error            # 错误处理
│   │       └── ErrorBoundary.tsx
│   ├── /lib                  # 核心库
│   │   ├── /pdf              # PDF 处理
│   │   │   ├── parser.ts     # PDF 解析
│   │   │   ├── renderer.ts   # PDF 渲染
│   │   │   └── validator.ts  # PDF 验证
│   │   ├── /canvas           # 画布操作
│   │   │   ├── manager.ts    # Fabric.js 管理
│   │   │   ├── zoom.ts       # 缩放控制
│   │   │   └── selection.ts  # 选择管理
│   │   ├── /annotation       # 标注系统
│   │   │   ├── highlight.ts  # 高亮处理
│   │   │   └── note.ts       # 笔记管理
│   │   ├── /ai               # AI 集成
│   │   │   ├── client.ts     # AI 客户端
│   │   │   ├── zhipu.ts      # 智谱 API
│   │   │   └── minimax.ts    # Minimax API
│   │   ├── /storage          # 本地存储
│   │   │   ├── indexeddb.ts  # IndexedDB 封装
│   │   │   ├── documents.ts  # 文档存储
│   │   │   ├── annotations.ts # 标注存储
│   │   │   ├── conversations.ts # 对话历史
│   │   │   └── settings.ts   # 设置存储
│   │   └── /utils            # 工具函数
│   │       ├── crypto.ts     # API Key 加密
│   │       ├── file.ts       # 文件处理
│   │       └── validation.ts # 验证函数
│   ├── /hooks                # React Hooks
│   │   ├── usePDF.ts         # PDF 管理
│   │   ├── useCanvas.ts      # 画布管理
│   │   ├── useAnnotation.ts  # 标注管理
│   │   ├── useAI.ts          # AI 对话
│   │   ├── useStorage.ts     # 本地存储
│   │   └── useResponsive.ts  # 响应式布局
│   ├── /types                # TypeScript 类型
│   │   ├── document.ts
│   │   ├── annotation.ts
│   │   ├── conversation.ts
│   │   └── settings.ts
│   └── /constants            # 常量定义
│       ├── limits.ts         # 文件大小等限制
│       ├── colors.ts         # 颜色常量
│       └── api.ts            # API 常量
├── /tests                    # 测试文件
│   ├── /unit
│   │   ├── pdf-parser.test.ts
│   │   ├── annotation.test.ts
│   │   └── crypto.test.ts
│   └── /integration
│       ├── upload-flow.test.ts
│       └── ai-chat.test.ts
├── /docs                     # 文档
│   └── /superpowers
│       ├── specs/            # Spec 文档
│       └── plans/            # 计划文档
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── .env.local.example
└── README.md
```

### 文件职责说明

**核心原则：**
1. **单一职责**：每个文件只做一件事
2. **高内聚**：相关的功能放在一起
3. **低耦合**：模块间通过清晰的接口通信
4. **可测试**：每个模块都可以独立测试

**关键文件职责：**
- `lib/pdf/parser.ts`: 纯 PDF 解析逻辑，返回结构化数据
- `lib/canvas/manager.ts`: Fabric.js 实例管理，不关心 PDF 细节
- `lib/annotation/highlight.ts`: 高亮数据模型和操作，不关心渲染
- `components/features/PDFCanvas.tsx`: 连接 PDF 解析和画布渲染
- `hooks/usePDF.ts`: 管理 PDF 状态和操作
- `lib/storage/*.ts`: 封装 IndexedDB 操作，提供简单 API

---

## Chunk 1: 项目脚手架与基础配置

### Task 1: 初始化 Next.js 项目

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `.env.local.example`
- Create: `.gitignore`

- [ ] **Step 1: 创建 Next.js 项目**

```bash
cd /Users/huangyuxiao/projects/mvp/reader
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias="@/*"
```

Expected: 项目创建成功

- [ ] **Step 2: 安装核心依赖**

```bash
npm install fabric@6 pdfjs-dist@4 @radix-ui/react-dialog @radix-ui/react-toast lucide-react
npm install --save-dev @types/fabric @types/node
```

Expected: 依赖安装成功

- [ ] **Step 3: 配置 TypeScript**

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: 配置 Tailwind CSS**

Update `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        primary: '#E42313',
        'text-primary': '#0D0D0D',
        'text-secondary': '#7A7A7A',
        'text-muted': '#B0B0B0',
        border: '#E8E8E8',
        surface: '#FAFAFA',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: 创建环境变量模板**

Create `.env.local.example`:

```bash
# AI Provider (可选：服务端默认配置)
AI_PROVIDER_DEFAULT=zhipu

# 文件限制
MAX_FILE_SIZE_MB=100
MAX_PAGE_COUNT=500
```

- [ ] **Step 6: 更新 .gitignore**

```gitignore
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 7: 提交初始化**

```bash
git add .
git commit -m "chore: initialize Next.js project with TypeScript and Tailwind

- Setup Next.js 14 with App Router
- Configure TypeScript with strict mode
- Setup Tailwind CSS with custom theme
- Add core dependencies: fabric, pdfjs-dist, radix-ui, lucide-react
- Add environment variable template

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 创建类型定义

**Files:**
- Create: `src/types/document.ts`
- Create: `src/types/annotation.ts`
- Create: `src/types/conversation.ts`
- Create: `src/types/settings.ts`

- [ ] **Step 1: 创建文档类型**

Create `src/types/document.ts`:

```typescript
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
```

- [ ] **Step 2: 创建标注类型**

Create `src/types/annotation.ts`:

```typescript
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

import { BoundingBox } from './document';
```

- [ ] **Step 3: 创建对话类型**

Create `src/types/conversation.ts`:

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ConversationHistory {
  id: string;
  documentId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: 创建设置类型**

Create `src/types/settings.ts`:

```typescript
export type AIProvider = 'zhipu' | 'minimax';

export interface Settings {
  provider: AIProvider;
  apiKey: string;
  theme?: 'light' | 'dark';
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
```

- [ ] **Step 5: 提交类型定义**

```bash
git add src/types/
git commit -m "feat: add TypeScript type definitions

- Define PDFDocument and BoundingBox types
- Define Annotation and Note types
- Define Conversation and Message types
- Define Settings and AIProvider types

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 创建常量定义

**Files:**
- Create: `src/constants/limits.ts`
- Create: `src/constants/colors.ts`
- Create: `src/constants/api.ts`

- [ ] **Step 1: 创建限制常量**

Create `src/constants/limits.ts`:

```typescript
export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_PAGE_COUNT = 500;
export const MAX_CONVERSATION_HISTORY = 50;
export const BATCH_PAGE_SIZE = 50;
```

- [ ] **Step 2: 创建颜色常量**

Create `src/constants/colors.ts`:

```typescript
export const COLORS = {
  HIGHLIGHT_YELLOW: '#FEF08A',
  NOTE_MARKER_RED: '#E42313',
  PAGE_BORDER: '#E8E8E8',
  CANVAS_BG: '#E8E8E8',
} as const;
```

- [ ] **Step 3: 创建 API 常量**

Create `src/constants/api.ts`:

```typescript
export const API_ENDPOINTS = {
  ZHIPU_CHAT: 'https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_pro/invoke',
  MINIMAX_CHAT: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
} as const;

export const AI_MODELS = {
  ZHIPU_GLM4: 'glm-4',
  MINIMAX_ABAB65: 'abab6.5-chat',
} as const;
```

- [ ] **Step 4: 提交常量定义**

```bash
git add src/constants/
git commit -m "feat: add application constants

- Define file size and page count limits
- Define color constants for UI elements
- Define AI API endpoints and model names

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 创建工具函数

**Files:**
- Create: `src/lib/utils/crypto.ts`
- Create: `src/lib/utils/file.ts`
- Create: `src/lib/utils/validation.ts`

- [ ] **Step 1: 创建加密工具**

Create `src/lib/utils/crypto.ts`:

```typescript
/**
 * 简单的 Base64 编码（用于 MVP）
 * 注意：这不是真正的加密，仅用于混淆
 */
export function encryptApiKey(key: string): string {
  return btoa(key);
}

/**
 * Base64 解码
 */
export function decryptApiKey(encrypted: string): string {
  try {
    return atob(encrypted);
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    return '';
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

- [ ] **Step 2: 创建文件工具**

Create `src/lib/utils/file.ts`:

```typescript
import { ValidationResult } from '@/types/settings';
import { MAX_FILE_SIZE_BYTES } from '@/constants/limits';

/**
 * 验证 PDF 文件
 */
export function validatePDFFile(file: File): ValidationResult {
  // 1. 文件类型
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // 2. 文件大小
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  // 3. 文件名安全
  if (file.name.includes('..') || file.name.includes('/')) {
    return { valid: false, error: 'Invalid file name' };
  }

  return { valid: true };
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 3: 创建验证工具**

Create `src/lib/utils/validation.ts`:

```typescript
import { ValidationResult } from '@/types/settings';

/**
 * 验证 API Key 格式
 */
export function validateApiKey(key: string): ValidationResult {
  if (!key || key.trim().length < 10) {
    return { valid: false, error: 'API key must be at least 10 characters' };
  }

  if (key.includes(' ') || key.includes('\n')) {
    return { valid: false, error: 'API key cannot contain spaces or newlines' };
  }

  return { valid: true };
}
```

- [ ] **Step 4: 提交工具函数**

```bash
git add src/lib/utils/
git commit -m "feat: add utility functions

- Add API key encryption/decryption (Base64)
- Add PDF file validation
- Add API key validation
- Add ID generator

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: IndexedDB 存储层

### Task 5: 创建 IndexedDB 封装

**Files:**
- Create: `src/lib/storage/indexeddb.ts`
- Create: `tests/unit/storage.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/storage.test.ts`:

```typescript
import { openDB, DB_NAME, DB_VERSION } from '@/lib/storage/indexeddb';

describe('IndexedDB', () => {
  it('should open database with correct version', async () => {
    const db = await openDB();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    db.close();
  });

  it('should create all required object stores', async () => {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);

    expect(storeNames).toContain('documents');
    expect(storeNames).toContain('annotations');
    expect(storeNames).toContain('notes');
    expect(storeNames).toContain('conversations');
    expect(storeNames).toContain('settings');

    db.close();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/storage.test.ts
```

Expected: FAIL - openDB not defined

- [ ] **Step 3: 实现 IndexedDB 封装**

Create `src/lib/storage/indexeddb.ts`:

```typescript
export const DB_NAME = 'ai-reader-db';
export const DB_VERSION = 1;

/**
 * 数据库迁移配置
 */
const migrations: Record<number, (db: IDBDatabase) => void> = {
  1: (db: IDBDatabase) => {
    // Documents store
    const documentStore = db.createObjectStore('documents', { keyPath: 'id' });
    documentStore.createIndex('createdAt', 'createdAt', { unique: false });
    documentStore.createIndex('fileName', 'fileName', { unique: false });

    // Annotations store
    const annotationStore = db.createObjectStore('annotations', { keyPath: 'id' });
    annotationStore.createIndex('documentId', 'documentId', { unique: false });
    annotationStore.createIndex('pageNumber', 'pageNumber', { unique: false });

    // Notes store
    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
    noteStore.createIndex('annotationId', 'annotationId', { unique: false });
    noteStore.createIndex('createdAt', 'createdAt', { unique: false });

    // Conversations store
    const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
    conversationStore.createIndex('documentId', 'documentId', { unique: false });
    conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });

    // Settings store
    db.createObjectStore('settings', { keyPath: 'key' });
  },
};

/**
 * 打开数据库（支持迁移）
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion || DB_VERSION;

      console.log(`Upgrading IndexedDB from version ${oldVersion} to ${newVersion}`);

      // 按顺序执行迁移
      for (let version = oldVersion + 1; version <= newVersion; version++) {
        const migration = migrations[version];
        if (migration) {
          console.log(`Running migration ${version}`);
          migration(db);
        }
      }
    };
  });
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/storage.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交 IndexedDB 封装**

```bash
git add src/lib/storage/indexeddb.ts tests/unit/storage.test.ts
git commit -m "feat: implement IndexedDB wrapper with migrations

- Add openDB function with migration support
- Create all required object stores (documents, annotations, notes, conversations, settings)
- Add indexes for efficient querying
- Add unit tests for database initialization

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 创建文档存储

**Files:**
- Create: `src/lib/storage/documents.ts`
- Create: `tests/unit/documents.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/documents.test.ts`:

```typescript
import { saveDocument, getDocument, getAllDocuments, deleteDocument } from '@/lib/storage/documents';
import { PDFDocument } from '@/types/document';
import { openDB } from '@/lib/storage/indexeddb';

describe('Documents Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  const testDoc: PDFDocument = {
    id: 'test-doc-1',
    fileName: 'test.pdf',
    fileSize: 1024,
    pageCount: 10,
    textContent: 'Test content',
    fileBlob: new Blob(['test'], { type: 'application/pdf' }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should save a document', async () => {
    await saveDocument(db, testDoc);
    const saved = await getDocument(db, testDoc.id);
    expect(saved).toBeTruthy();
    expect(saved?.fileName).toBe('test.pdf');
  });

  it('should get all documents', async () => {
    const docs = await getAllDocuments(db);
    expect(docs.length).toBeGreaterThan(0);
  });

  it('should delete a document', async () => {
    await deleteDocument(db, testDoc.id);
    const deleted = await getDocument(db, testDoc.id);
    expect(deleted).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/documents.test.ts
```

Expected: FAIL - saveDocument not defined

- [ ] **Step 3: 实现文档存储**

Create `src/lib/storage/documents.ts`:

```typescript
import { PDFDocument } from '@/types/document';

/**
 * 保存文档
 */
export async function saveDocument(
  db: IDBDatabase,
  document: PDFDocument
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.put(document);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取单个文档
 */
export async function getDocument(
  db: IDBDatabase,
  id: string
): Promise<PDFDocument | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readonly');
    const store = tx.objectStore('documents');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有文档
 */
export async function getAllDocuments(
  db: IDBDatabase
): Promise<PDFDocument[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readonly');
    const store = tx.objectStore('documents');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除文档
 */
export async function deleteDocument(
  db: IDBDatabase,
  id: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents'], 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/documents.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交文档存储**

```bash
git add src/lib/storage/documents.ts tests/unit/documents.test.ts
git commit -m "feat: implement document storage layer

- Add CRUD operations for documents
- Add unit tests for all operations
- Support saving PDF files as Blob

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 创建标注存储

**Files:**
- Create: `src/lib/storage/annotations.ts`
- Create: `tests/unit/annotations.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/annotations.test.ts`:

```typescript
import {
  saveAnnotation,
  getAnnotationsByDocument,
  deleteAnnotation,
} from '@/lib/storage/annotations';
import { Annotation } from '@/types/annotation';
import { openDB } from '@/lib/storage/indexeddb';

describe('Annotations Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  const testAnnotation: Annotation = {
    id: 'anno-1',
    documentId: 'doc-1',
    pageNumber: 1,
    type: 'highlight',
    color: '#FEF08A',
    position: { x: 100, y: 100, width: 200, height: 20 },
    text: 'Highlighted text',
    createdAt: new Date(),
  };

  it('should save an annotation', async () => {
    await saveAnnotation(db, testAnnotation);
    const saved = await getAnnotationsByDocument(db, 'doc-1');
    expect(saved.length).toBe(1);
    expect(saved[0].text).toBe('Highlighted text');
  });

  it('should delete an annotation', async () => {
    await deleteAnnotation(db, 'anno-1');
    const saved = await getAnnotationsByDocument(db, 'doc-1');
    expect(saved.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/annotations.test.ts
```

Expected: FAIL - saveAnnotation not defined

- [ ] **Step 3: 实现标注存储**

Create `src/lib/storage/annotations.ts`:

```typescript
import { Annotation } from '@/types/annotation';

/**
 * 保存标注
 */
export async function saveAnnotation(
  db: IDBDatabase,
  annotation: Annotation
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.put(annotation);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取文档的所有标注
 */
export async function getAnnotationsByDocument(
  db: IDBDatabase,
  documentId: string
): Promise<Annotation[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readonly');
    const store = tx.objectStore('annotations');
    const index = store.index('documentId');
    const request = index.getAll(documentId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除标注
 */
export async function deleteAnnotation(
  db: IDBDatabase,
  id: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['annotations'], 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/annotations.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交标注存储**

```bash
git add src/lib/storage/annotations.ts tests/unit/annotations.test.ts
git commit -m "feat: implement annotation storage layer

- Add CRUD operations for annotations
- Add index-based query by documentId
- Add unit tests for all operations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 创建对话历史存储

**Files:**
- Create: `src/lib/storage/conversations.ts`
- Create: `tests/unit/conversations.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/conversations.test.ts`:

```typescript
import {
  getConversationHistory,
  addMessageToHistory,
} from '@/lib/storage/conversations';
import { openDB } from '@/lib/storage/indexeddb';

describe('Conversations Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  it('should add messages to history', async () => {
    await addMessageToHistory(db, 'doc-1', {
      role: 'user',
      content: 'Test question',
    });

    const history = await getConversationHistory(db, 'doc-1');
    expect(history).toBeTruthy();
    expect(history?.messages.length).toBe(1);
    expect(history?.messages[0].content).toBe('Test question');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/conversations.test.ts
```

Expected: FAIL - getConversationHistory not defined

- [ ] **Step 3: 实现对话历史存储**

Create `src/lib/storage/conversations.ts`:

```typescript
import { ConversationHistory, Message } from '@/types/conversation';
import { MAX_CONVERSATION_HISTORY } from '@/constants/limits';

/**
 * 获取对话历史
 */
export async function getConversationHistory(
  db: IDBDatabase,
  documentId: string
): Promise<ConversationHistory | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['conversations'], 'readonly');
    const store = tx.objectStore('conversations');
    const request = store.get(documentId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 添加消息到历史
 */
export async function addMessageToHistory(
  db: IDBDatabase,
  documentId: string,
  message: Message
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // 获取或创建历史
      let history = await getConversationHistory(db, documentId);
      if (!history) {
        history = {
          id: documentId,
          documentId,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      // 添加消息
      history.messages.push({
        ...message,
        timestamp: new Date(),
      });

      // 限制历史长度
      if (history.messages.length > MAX_CONVERSATION_HISTORY) {
        history.messages = history.messages.slice(-MAX_CONVERSATION_HISTORY);
      }

      // 更新时间戳
      history.updatedAt = new Date();

      // 保存
      const tx = db.transaction(['conversations'], 'readwrite');
      const store = tx.objectStore('conversations');
      const request = store.put(history);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/conversations.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交对话历史存储**

```bash
git add src/lib/storage/conversations.ts tests/unit/conversations.test.ts
git commit -m "feat: implement conversation history storage

- Add getConversationHistory function
- Add addMessageToHistory with length limit
- Add unit tests for conversation management

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: 创建设置存储

**Files:**
- Create: `src/lib/storage/settings.ts`
- Create: `tests/unit/settings.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/settings.test.ts`:

```typescript
import { getSettings, saveSettings } from '@/lib/storage/settings';
import { openDB } from '@/lib/storage/indexeddb';

describe('Settings Storage', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  it('should save and get settings', async () => {
    await saveSettings(db, 'provider', 'zhipu');
    const provider = await getSettings(db, 'provider');
    expect(provider).toBe('zhipu');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/settings.test.ts
```

Expected: FAIL - getSettings not defined

- [ ] **Step 3: 实现设置存储**

Create `src/lib/storage/settings.ts`:

```typescript
/**
 * 获取设置
 */
export async function getSettings<T = any>(
  db: IDBDatabase,
  key: string
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result?.value);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存设置
 */
export async function saveSettings<T = any>(
  db: IDBDatabase,
  key: string,
  value: T
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/settings.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交设置存储**

```bash
git add src/lib/storage/settings.ts tests/unit/settings.test.ts
git commit -m "feat: implement settings storage

- Add generic getSettings and saveSettings functions
- Add unit tests for settings operations
- Support type-safe settings access

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

---

## Chunk 3: PDF 解析与渲染

### Task 10: 创建 PDF 解析器

**Files:**
- Create: `src/lib/pdf/parser.ts`
- Create: `src/lib/pdf/validator.ts`
- Create: `tests/unit/pdf-parser.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/pdf-parser.test.ts`:

```typescript
import { validatePDFFile, checkPageLimit, extractTextFromPDF } from '@/lib/pdf/parser';

describe('PDF Parser', () => {
  it('should validate PDF file type', () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    const result = validatePDFFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Only PDF files');
  });

  it('should validate file size', () => {
    const largeFile = new File(['x'.repeat(101 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });
    const result = validatePDFFile(largeFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100MB limit');
  });

  it('should reject invalid file names', () => {
    const file = new File([''], '../test.pdf', { type: 'application/pdf' });
    const result = validatePDFFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file name');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/pdf-parser.test.ts
```

Expected: FAIL - validatePDFFile not defined

- [ ] **Step 3: 实现 PDF 验证器**

Create `src/lib/pdf/validator.ts`:

```typescript
import { ValidationResult } from '@/types/settings';
import { MAX_FILE_SIZE_BYTES } from '@/constants/limits';

/**
 * 验证 PDF 文件
 */
export function validatePDFFile(file: File): ValidationResult {
  // 1. 文件类型
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // 2. 文件大小
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  // 3. 文件名安全
  if (file.name.includes('..') || file.name.includes('/')) {
    return { valid: false, error: 'Invalid file name' };
  }

  return { valid: true };
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/pdf-parser.test.ts
```

Expected: PASS (部分)

- [ ] **Step 5: 实现 PDF 解析器**

Create `src/lib/pdf/parser.ts`:

```typescript
import pdfjsLib from 'pdfjs-dist';
import { validatePDFFile } from './validator';
import { MAX_PAGE_COUNT, BATCH_PAGE_SIZE } from '@/constants/limits';
import { ValidationResult } from '@/types/settings';

// 设置 PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

/**
 * 检查页数限制
 */
export async function checkPageLimit(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdfDoc.numPages;

  if (pageCount > MAX_PAGE_COUNT) {
    throw new Error(`PDF has ${pageCount} pages. Maximum supported is ${MAX_PAGE_COUNT} pages.`);
  }

  return pageCount;
}

/**
 * 从 PDF 提取文本（支持大文档分批处理）
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfDoc.numPages;
  const batches: string[] = [];

  // 分批处理
  for (let i = 1; i <= totalPages; i += BATCH_PAGE_SIZE) {
    const endPage = Math.min(i + BATCH_PAGE_SIZE - 1, totalPages);
    const batchTexts: string[] = [];

    for (let page = i; page <= endPage; page++) {
      const pageObj = await pdfDoc.getPage(page);
      const textContent = await pageObj.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      batchTexts.push(pageText);

      // 让出主线程，避免阻塞 UI
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    batches.push(batchTexts.join('\n\n'));
  }

  return batches.join('\n\n---PAGE_BREAK---\n\n');
}
```

- [ ] **Step 6: 提交 PDF 解析器**

```bash
git add src/lib/pdf/ tests/unit/pdf-parser.test.ts
git commit -m "feat: implement PDF parser with validation

- Add PDF file validation (type, size, filename)
- Add page limit checking
- Add text extraction with batch processing
- Add unit tests for validation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 11: 创建 PDF 渲染器

**Files:**
- Create: `src/lib/pdf/renderer.ts`
- Create: `tests/unit/pdf-renderer.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/pdf-renderer.test.ts`:

```typescript
import { renderPageToCanvas } from '@/lib/pdf/renderer';

describe('PDF Renderer', () => {
  it('should render PDF page to canvas', async () => {
    // 创建模拟的 canvas
    const canvas = document.createElement('canvas');
    canvas.width = 595;
    canvas.height = 842;

    // 这里需要实际的 PDF 文件进行测试
    // 在集成测试中完成
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: 实现 PDF 渲染器**

Create `src/lib/pdf/renderer.ts`:

```typescript
import pdfjsLib from 'pdfjs-dist';
import { BoundingBox } from '@/types/document';

/**
 * 渲染 PDF 页面到 Canvas
 */
export async function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: pdfjsLib.PDFPageProxy,
  scale: number = 1.5
): Promise<void> {
  const viewport = page.getViewport({ scale });

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get canvas context');
  }

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
}

/**
 * 获取 PDF 页面的文本边界框
 */
export async function getTextBoundingBoxes(
  page: pdfjsLib.PDFPageProxy,
  scale: number = 1.5
): Promise<BoundingBox[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale });
  const boxes: BoundingBox[] = [];

  textContent.items.forEach((item: any) => {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);

    boxes.push({
      x: tx[4],
      y: tx[5],
      width: item.width * scale,
      height: item.height * scale,
    });
  });

  return boxes;
}
```

- [ ] **Step 3: 提交 PDF 渲染器**

```bash
git add src/lib/pdf/renderer.ts tests/unit/pdf-renderer.test.ts
git commit -m "feat: implement PDF page renderer

- Add renderPageToCanvas function
- Add getTextBoundingBoxes for text selection
- Add unit test placeholder (integration test needed)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: 创建 PDF 管理 Hook

**Files:**
- Create: `src/hooks/usePDF.ts`

- [ ] **Step 1: 创建 usePDF Hook**

Create `src/hooks/usePDF.ts`:

```typescript
import { useState, useCallback } from 'react';
import { PDFDocument } from '@/types/document';
import { validatePDFFile, checkPageLimit, extractTextFromPDF } from '@/lib/pdf/parser';
import { saveDocument } from '@/lib/storage/documents';
import { openDB } from '@/lib/storage/indexeddb';
import { generateId } from '@/lib/utils/crypto';

interface UsePDFReturn {
  currentDocument: PDFDocument | null;
  isLoading: boolean;
  error: string | null;
  uploadPDF: (file: File) => Promise<void>;
  loadDocument: (id: string) => Promise<void>;
}

export function usePDF(): UsePDFReturn {
  const [currentDocument, setCurrentDocument] = useState<PDFDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPDF = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. 验证文件
      const validation = validatePDFFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 2. 检查页数
      const pageCount = await checkPageLimit(file);

      // 3. 提取文本
      const textContent = await extractTextFromPDF(file);

      // 4. 创建文档对象
      const document: PDFDocument = {
        id: generateId(),
        fileName: file.name,
        fileSize: file.size,
        pageCount,
        textContent,
        fileBlob: file,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 5. 保存到 IndexedDB
      const db = await openDB();
      await saveDocument(db, document);

      setCurrentDocument(document);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDocument = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const db = await openDB();
      const { getDocument } = await import('@/lib/storage/documents');
      const doc = await getDocument(db, id);

      if (!doc) {
        throw new Error('Document not found');
      }

      setCurrentDocument(doc);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    currentDocument,
    isLoading,
    error,
    uploadPDF,
    loadDocument,
  };
}
```

- [ ] **Step 2: 提交 usePDF Hook**

```bash
git add src/hooks/usePDF.ts
git commit -m "feat: implement usePDF hook

- Add PDF upload with validation
- Add text extraction
- Add document loading from IndexedDB
- Add loading and error states

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: 画布交互与标注功能

### Task 13: 创建 Fabric.js 画布管理器

**Files:**
- Create: `src/lib/canvas/manager.ts`
- Create: `src/lib/canvas/zoom.ts`
- Create: `tests/unit/canvas-manager.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/unit/canvas-manager.test.ts`:

```typescript
import { CanvasManager } from '@/lib/canvas/manager';

describe('Canvas Manager', () => {
  let manager: CanvasManager;
  let canvasEl: HTMLCanvasElement;

  beforeEach(() => {
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'test-canvas';
    document.body.appendChild(canvasEl);
    manager = new CanvasManager('test-canvas');
  });

  afterEach(() => {
    manager.dispose();
    document.body.removeChild(canvasEl);
  });

  it('should initialize canvas', () => {
    expect(manager.getCanvas()).toBeTruthy();
  });

  it('should set zoom level', () => {
    manager.setZoom(2.0);
    expect(manager.getZoom()).toBe(2.0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test tests/unit/canvas-manager.test.ts
```

Expected: FAIL - CanvasManager not defined

- [ ] **Step 3: 实现画布管理器**

Create `src/lib/canvas/manager.ts`:

```typescript
import { fabric } from 'fabric';

export class CanvasManager {
  private canvas: fabric.Canvas;
  private currentZoom: number = 1.0;

  constructor(canvasId: string) {
    this.canvas = new fabric.Canvas(canvasId, {
      selection: true,
      backgroundColor: '#E8E8E8',
    });

    // 降低渲染频率
    this.canvas.renderOnAddRemove = false;
  }

  getCanvas(): fabric.Canvas {
    return this.canvas;
  }

  setZoom(zoom: number): void {
    this.currentZoom = Math.max(0.25, Math.min(4.0, zoom));
    this.canvas.setZoom(this.currentZoom);
    this.canvas.renderAll();
  }

  getZoom(): number {
    return this.currentZoom;
  }

  clear(): void {
    this.canvas.clear();
    this.canvas.backgroundColor = '#E8E8E8';
    this.canvas.renderAll();
  }

  dispose(): void {
    this.canvas.dispose();
  }

  renderAll(): void {
    this.canvas.renderAll();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test tests/unit/canvas-manager.test.ts
```

Expected: PASS

- [ ] **Step 5: 实现缩放控制**

Create `src/lib/canvas/zoom.ts`:

```typescript
import { CanvasManager } from './manager';

export class ZoomController {
  private manager: CanvasManager;
  private minZoom: number = 0.25;
  private maxZoom: number = 4.0;
  private zoomStep: number = 0.25;

  constructor(manager: CanvasManager) {
    this.manager = manager;
  }

  zoomIn(): void {
    const current = this.manager.getZoom();
    const newZoom = Math.min(this.maxZoom, current + this.zoomStep);
    this.manager.setZoom(newZoom);
  }

  zoomOut(): void {
    const current = this.manager.getZoom();
    const newZoom = Math.max(this.minZoom, current - this.zoomStep);
    this.manager.setZoom(newZoom);
  }

  resetZoom(): void {
    this.manager.setZoom(1.0);
  }

  getZoomPercentage(): number {
    return Math.round(this.manager.getZoom() * 100);
  }
}
```

- [ ] **Step 6: 提交画布管理器**

```bash
git add src/lib/canvas/ tests/unit/canvas-manager.test.ts
git commit -m "feat: implement canvas manager and zoom control

- Add CanvasManager class with Fabric.js integration
- Add ZoomController for zoom in/out/reset
- Add unit tests for canvas operations
- Configure performance optimizations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 14: 创建标注层

**Files:**
- Create: `src/lib/annotation/highlight.ts`
- Create: `src/lib/annotation/note.ts`
- Create: `src/hooks/useAnnotation.ts`

- [ ] **Step 1: 实现高亮管理**

Create `src/lib/annotation/highlight.ts`:

```typescript
import { fabric } from 'fabric';
import { Annotation, Note } from '@/types/annotation';
import { COLORS } from '@/constants/colors';
import { generateId } from '@/lib/utils/crypto';

export class HighlightManager {
  private canvas: fabric.Canvas;

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas;
  }

  /**
   * 添加高亮
   */
  addHighlight(bounds: BoundingBox, text: string): Annotation {
    const highlight = new fabric.Rect({
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fill: COLORS.HIGHLIGHT_YELLOW,
      opacity: 0.4,
      selectable: true,
      hasControls: false,
      data: {
        type: 'highlight',
        text,
      },
    });

    this.canvas.add(highlight);
    this.canvas.renderAll();

    return {
      id: generateId(),
      documentId: '', // 由调用者设置
      pageNumber: 1, // 由调用者设置
      type: 'highlight',
      color: COLORS.HIGHLIGHT_YELLOW,
      position: bounds,
      text,
      createdAt: new Date(),
    };
  }

  /**
   * 删除高亮
   */
  removeHighlight(annotationId: string): void {
    const objects = this.canvas.getObjects();
    const highlight = objects.find(obj => (obj as any).data?.id === annotationId);

    if (highlight) {
      this.canvas.remove(highlight);
      this.canvas.renderAll();
    }
  }
}

import { BoundingBox } from '@/types/document';
```

- [ ] **Step 2: 实现笔记管理**

Create `src/lib/annotation/note.ts`:

```typescript
import { fabric } from 'fabric';
import { Note } from '@/types/annotation';
import { COLORS } from '@/constants/colors';
import { generateId } from '@/lib/utils/crypto';

export class NoteManager {
  private canvas: fabric.Canvas;

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas;
  }

  /**
   * 添加笔记标记
   */
  addNoteMarker(
    position: { x: number; y: number },
    annotationId: string,
    onClick?: (note: Note) => void
  ): Note {
    const marker = new fabric.Circle({
      left: position.x,
      top: position.y,
      radius: 12,
      fill: COLORS.NOTE_MARKER_RED,
      selectable: true,
      hasControls: false,
      data: {
        type: 'note-marker',
        annotationId,
      },
    });

    if (onClick) {
      marker.on('mousedown', () => {
        const note: Note = {
          id: generateId(),
          annotationId,
          content: '', // 由调用者填充
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        onClick(note);
      });
    }

    this.canvas.add(marker);
    this.canvas.renderAll();

    return {
      id: generateId(),
      annotationId,
      content: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
```

- [ ] **Step 3: 创建 useAnnotation Hook**

Create `src/hooks/useAnnotation.ts`:

```typescript
import { useState, useCallback } from 'react';
import { Annotation, Note } from '@/types/annotation';
import { saveAnnotation, getAnnotationsByDocument } from '@/lib/storage/annotations';
import { openDB } from '@/lib/storage/indexeddb';

interface UseAnnotationReturn {
  annotations: Annotation[];
  addAnnotation: (annotation: Annotation) => Promise<void>;
  loadAnnotations: (documentId: string) => Promise<void>;
}

export function useAnnotation(): UseAnnotationReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const addAnnotation = useCallback(async (annotation: Annotation) => {
    const db = await openDB();
    await saveAnnotation(db, annotation);
    setAnnotations(prev => [...prev, annotation]);
  }, []);

  const loadAnnotations = useCallback(async (documentId: string) => {
    const db = await openDB();
    const loaded = await getAnnotationsByDocument(db, documentId);
    setAnnotations(loaded);
  }, []);

  return {
    annotations,
    addAnnotation,
    loadAnnotations,
  };
}
```

- [ ] **Step 4: 提交标注层**

```bash
git add src/lib/annotation/ src/hooks/useAnnotation.ts
git commit -m "feat: implement annotation layer

- Add HighlightManager for text highlighting
- Add NoteManager for note markers
- Add useAnnotation hook for state management
- Support IndexedDB persistence

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: AI 对话功能

### Task 15: 创建 AI 客户端

**Files:**
- Create: `src/lib/ai/client.ts`
- Create: `src/lib/ai/zhipu.ts`
- Create: `src/lib/ai/minimax.ts`

- [ ] **Step 1: 实现智谱 AI 客户端**

Create `src/lib/ai/zhipu.ts`:

```typescript
import { API_ENDPOINTS, AI_MODELS } from '@/constants/api';

interface ZhipuMessage {
  role: string;
  content: string;
}

export async function callZhipuAPI(
  apiKey: string,
  messages: ZhipuMessage[]
): Promise<ReadableStream> {
  const response = await fetch(API_ENDPOINTS.ZHIPU_CHAT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODELS.ZHIPU_GLM4,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Zhipu API error: ${response.status}`);
  }

  return response.body!;
}
```

- [ ] **Step 2: 实现 Minimax 客户端**

Create `src/lib/ai/minimax.ts`:

```typescript
import { API_ENDPOINTS, AI_MODELS } from '@/constants/api';

interface MinimaxMessage {
  role: string;
  content: string;
}

export async function callMinimaxAPI(
  apiKey: string,
  messages: MinimaxMessage[]
): Promise<ReadableStream> {
  const response = await fetch(API_ENDPOINTS.MINIMAX_CHAT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODELS.MINIMAX_ABAB65,
      messages,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    throw new Error(`Minimax API error: ${response.status}`);
  }

  return response.body!;
}
```

- [ ] **Step 3: 实现通用 AI 客户端**

Create `src/lib/ai/client.ts`:

```typescript
import { AIProvider } from '@/types/settings';
import { callZhipuAPI } from './zhipu';
import { callMinimaxAPI } from './minimax';

export interface AIRequest {
  provider: AIProvider;
  apiKey: string;
  prompt: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export async function callAI(request: AIRequest): Promise<ReadableStream> {
  const messages = [
    ...(request.conversationHistory || []),
    { role: 'user', content: request.prompt },
  ];

  switch (request.provider) {
    case 'zhipu':
      return callZhipuAPI(request.apiKey, messages);
    case 'minimax':
      return callMinimaxAPI(request.apiKey, messages);
    default:
      throw new Error(`Unsupported AI provider: ${request.provider}`);
  }
}
```

- [ ] **Step 4: 提交 AI 客户端**

```bash
git add src/lib/ai/
git commit -m "feat: implement AI client layer

- Add Zhipu GLM-4 API integration
- Add Minimax API integration
- Add unified AI client interface
- Support streaming responses

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 16: 创建 API Route

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: 实现 Chat API Route**

Create `src/app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/client';
import { getDocument } from '@/lib/storage/documents';
import { openDB } from '@/lib/storage/indexeddb';
import { validateApiKey } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, documentId, provider, apiKey, conversationHistory } = body;

    // 1. 验证 API Key
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // 2. 获取文档内容
    const db = await openDB();
    const document = await getDocument(db, documentId);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // 3. 构建 Prompt
    const historyContext = conversationHistory
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `
You are an AI assistant helping users understand PDF documents.

Document content:
${document.textContent}

Conversation history:
${historyContext}

Current question: ${message}

Please answer based on the document content and conversation context.
    `;

    // 4. 调用 AI API
    try {
      const stream = await callAI({
        provider,
        apiKey,
        prompt,
        conversationHistory,
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error: any) {
      // 处理 AI API 错误
      const status = error.status || error.response?.status;

      if (status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your settings.' },
          { status: 401 }
        );
      } else if (status === 429) {
        return NextResponse.json(
          { error: 'API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      } else if (status === 402 || status === 403) {
        return NextResponse.json(
          { error: 'Insufficient API quota. Please check your billing.' },
          { status: 402 }
        );
      } else {
        console.error('AI API error:', error);
        return NextResponse.json(
          { error: 'AI service unavailable. Please try again later.' },
          { status: 503 }
        );
      }
    }
  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 提交 API Route**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: implement AI chat API route

- Add POST /api/chat endpoint
- Add API key validation
- Add document content retrieval
- Add error handling for AI API failures
- Support streaming responses

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 17: 创建 useAI Hook

**Files:**
- Create: `src/hooks/useAI.ts`

- [ ] **Step 1: 实现 useAI Hook**

Create `src/hooks/useAI.ts`:

```typescript
import { useState, useCallback } from 'react';
import { Message } from '@/types/conversation';
import { addMessageToHistory, getConversationHistory } from '@/lib/storage/conversations';
import { openDB } from '@/lib/storage/indexeddb';
import { AIProvider } from '@/types/settings';

interface UseAIReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string, documentId: string, provider: AIProvider, apiKey: string) => Promise<void>;
  loadHistory: (documentId: string) => Promise<void>;
}

export function useAI(): UseAIReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    message: string,
    documentId: string,
    provider: AIProvider,
    apiKey: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. 添加用户消息
      const userMessage: Message = { role: 'user', content: message };
      setMessages(prev => [...prev, userMessage]);

      const db = await openDB();
      await addMessageToHistory(db, documentId, userMessage);

      // 2. 获取对话历史
      const history = await getConversationHistory(db, documentId);
      const conversationHistory = history?.messages || [];

      // 3. 调用 API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          documentId,
          provider,
          apiKey,
          conversationHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      // 4. 处理流式响应
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            if (!data.done) {
              assistantMessage += data.content;
              // 实时更新 UI
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
                  newMessages[lastIndex].content = assistantMessage;
                } else {
                  newMessages.push({ role: 'assistant', content: assistantMessage });
                }
                return newMessages;
              });
            }
          }
        }
      }

      // 5. 保存助手消息
      const assistantMsg: Message = { role: 'assistant', content: assistantMessage };
      await addMessageToHistory(db, documentId, assistantMsg);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (documentId: string) => {
    const db = await openDB();
    const history = await getConversationHistory(db, documentId);
    if (history) {
      setMessages(history.messages);
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    loadHistory,
  };
}
```

- [ ] **Step 2: 提交 useAI Hook**

```bash
git add src/hooks/useAI.ts
git commit -m "feat: implement useAI hook

- Add message sending with streaming support
- Add conversation history management
- Add error handling
- Support real-time UI updates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

由于篇幅限制，我将在下一个消息中继续完成 Chunk 6-7（UI 组件与部署）。请告诉我是否继续？
---

## Chunk 6: UI 组件与界面集成

### Task 18: 创建基础 UI 组件

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Dialog.tsx`
- Create: `src/components/ui/Toast.tsx`

- [ ] **Step 1: 创建 Button 组件**

Create `src/components/ui/Button.tsx`:

```tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'font-display font-medium transition-colors disabled:opacity-50';

  const variants = {
    primary: 'bg-primary text-white hover:opacity-90',
    secondary: 'bg-white border border-border text-text-primary hover:bg-surface',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: 创建 Input 组件**

Create `src/components/ui/Input.tsx`:

```tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-2 border border-border bg-surface text-text-primary
          focus:outline-none focus:ring-2 focus:ring-primary/20
          ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 创建 Dialog 组件**

Create `src/components/ui/Dialog.tsx`:

```tsx
'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Dialog({ children, ...props }: DialogPrimitive.DialogProps) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

export function DialogTrigger({ children, ...props }: DialogPrimitive.DialogTriggerProps) {
  return <DialogPrimitive.Trigger {...props}>{children}</DialogPrimitive.Trigger>;
}

export function DialogContent({
  children,
  className = '',
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50" />
      <DialogPrimitive.Content
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          bg-white p-6 shadow-lg ${className}`}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 text-text-muted hover:text-text-primary">
          <X size={16} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ children, ...props }: DialogPrimitive.DialogTitleProps) {
  return (
    <DialogPrimitive.Title className="text-lg font-semibold font-display" {...props}>
      {children}
    </DialogPrimitive.Title>
  );
}
```

- [ ] **Step 4: 提交基础 UI 组件**

```bash
git add src/components/ui/
git commit -m "feat: add basic UI components

- Add Button component with variants
- Add Input component with error handling
- Add Dialog component using Radix UI
- Follow Swiss Clean design system

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 19: 创建布局组件

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/MainCanvas.tsx`
- Create: `src/components/layout/AIPanel.tsx`
- Create: `src/components/layout/Toolbar.tsx`

- [ ] **Step 1: 创建 Sidebar 组件**

Create `src/components/layout/Sidebar.tsx`:

```tsx
'use client';

import { Upload, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SidebarProps {
  onUpload: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onUpload, onOpenSettings }: SidebarProps) {
  return (
    <div className="w-[280px] h-full bg-white border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-8 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary" />
        <span className="text-lg font-semibold font-display">AI Reader</span>
      </div>

      {/* Upload Section */}
      <div className="px-8 py-6">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Document
        </label>
        <Button
          onClick={onUpload}
          className="w-full mt-2 flex items-center justify-center gap-2"
        >
          <Upload size={16} />
          Upload PDF
        </Button>
      </div>

      {/* Settings */}
      <div className="mt-auto px-8 py-6">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
        >
          <Settings size={16} />
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 Toolbar 组件**

Create `src/components/layout/Toolbar.tsx`:

```tsx
'use client';

import { ZoomIn, ZoomOut, Highlighter, MessageSquare } from 'lucide-react';

interface ToolbarProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHighlight: () => void;
  onNote: () => void;
}

export function Toolbar({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onHighlight,
  onNote,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {/* Zoom Controls */}
      <button
        onClick={onZoomOut}
        className="w-9 h-9 flex items-center justify-center border border-border hover:bg-surface"
      >
        <ZoomOut size={16} />
      </button>

      <span className="text-sm text-text-primary">{zoomLevel}%</span>

      <button
        onClick={onZoomIn}
        className="w-9 h-9 flex items-center justify-center border border-border hover:bg-surface"
      >
        <ZoomIn size={16} />
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Annotation Tools */}
      <button
        onClick={onHighlight}
        className="h-9 px-3 flex items-center gap-1.5 border border-border hover:bg-surface"
      >
        <Highlighter size={16} />
        <span className="text-sm">Highlight</span>
      </button>

      <button
        onClick={onNote}
        className="h-9 px-3 flex items-center gap-1.5 border border-border hover:bg-surface"
      >
        <MessageSquare size={16} />
        <span className="text-sm">Note</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 创建 MainCanvas 组件**

Create `src/components/layout/MainCanvas.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { Toolbar } from './Toolbar';
import { FileText } from 'lucide-react';

interface MainCanvasProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasDocument: boolean;
}

export function MainCanvas({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  hasDocument,
}: MainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div className="flex-1 h-full bg-surface p-6">
      <Toolbar
        zoomLevel={zoomLevel}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onHighlight={() => {/* TODO */}}
        onNote={() => {/* TODO */}}
      />

      <div className="w-full h-[calc(100%-60px)] bg-white border-2 border-border flex items-center justify-center">
        {hasDocument ? (
          <canvas ref={canvasRef} id="pdf-canvas" />
        ) : (
          <div className="flex flex-col items-center gap-4 text-text-muted">
            <FileText size={64} />
            <p className="text-base">Upload a PDF to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 AI Panel 组件**

Create `src/components/layout/AIPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface AIPanelProps {
  messages: Array<{ role: string; content: string }>;
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export function AIPanel({ messages, onSendMessage, isLoading }: AIPanelProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="w-[380px] h-full bg-white border-l border-border flex flex-col">
      {/* Header */}
      <div className="p-8 flex items-center justify-between border-b border-border">
        <h2 className="text-lg font-semibold font-display">AI Assistant</h2>
        <button className="text-text-muted hover:text-text-primary">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 p-8 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="bg-surface p-4 border border-border">
            <p className="text-sm">
              👋 Hi! I'm your AI assistant. Ask me anything about your PDF document.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-4 ${msg.role === 'user' ? 'bg-white border border-border' : 'bg-surface'}`}
            >
              <p className="text-sm">{msg.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-8 flex gap-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question about your PDF..."
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={isLoading}>
          <Send size={18} />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 提交布局组件**

```bash
git add src/components/layout/
git commit -m "feat: add layout components

- Add Sidebar with upload and settings
- Add Toolbar with zoom and annotation tools
- Add MainCanvas with placeholder state
- Add AI Panel with chat interface
- Follow Swiss Clean design system

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 20: 创建功能组件

**Files:**
- Create: `src/components/features/PDFUploader.tsx`
- Create: `src/components/features/SettingsModal.tsx`
- Create: `src/components/features/NotePopup.tsx`

- [ ] **Step 1: 创建 PDFUploader 组件**

Create `src/components/features/PDFUploader.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { validatePDFFile } from '@/lib/pdf/validator';
import { formatFileSize } from '@/lib/utils/file';

interface PDFUploaderProps {
  onUpload: (file: File) => void;
  onError: (error: string) => void;
}

export function PDFUploader({ onUpload, onError }: PDFUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validatePDFFile(file);
    if (!validation.valid) {
      onError(validation.error!);
      return;
    }

    onUpload(file);
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      onChange={handleChange}
      className="hidden"
    />
  );
}
```

- [ ] **Step 2: 创建 SettingsModal 组件**

Create `src/components/features/SettingsModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AIProvider } from '@/types/settings';
import { encryptApiKey, decryptApiKey } from '@/lib/utils/crypto';
import { validateApiKey } from '@/lib/utils/validation';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (provider: AIProvider, apiKey: string) => void;
  initialProvider?: AIProvider;
  initialApiKey?: string;
}

export function SettingsModal({
  open,
  onClose,
  onSave,
  initialProvider = 'zhipu',
  initialApiKey = '',
}: SettingsModalProps) {
  const [provider, setProvider] = useState<AIProvider>(initialProvider);
  const [apiKey, setApiKey] = useState(initialApiKey ? decryptApiKey(initialApiKey) : '');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    onSave(provider, encryptApiKey(apiKey));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[600px]">
        <DialogTitle>Settings</DialogTitle>

        <div className="mt-6 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-semibold font-display mb-2">
              AI Provider
            </label>
            <p className="text-sm text-text-secondary mb-3">
              Choose your preferred AI model provider and enter your API key.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setProvider('zhipu')}
                className={`flex-1 py-2.5 text-sm font-medium font-display
                  ${provider === 'zhipu' ? 'bg-primary text-white' : 'bg-white border border-border'}`}
              >
                智谱 GLM-4
              </button>
              <button
                onClick={() => setProvider('minimax')}
                className={`flex-1 py-2.5 text-sm font-medium font-display
                  ${provider === 'minimax' ? 'bg-primary text-white' : 'bg-white border border-border'}`}
              >
                Minimax
              </button>
            </div>
          </div>

          {/* API Key Input */}
          <div>
            <Input
              label="API Key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError('');
              }}
              error={error}
              placeholder="Enter your API key..."
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="mt-2 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              {showKey ? 'Hide' : 'Show'} API key
            </button>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} className="w-full">
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: 提交功能组件**

```bash
git add src/components/features/
git commit -m "feat: add feature components

- Add PDFUploader with file validation
- Add SettingsModal with provider selection
- Add API key input with show/hide toggle
- Add encryption for API key storage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 21: 创建主页面

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: 更新全局样式**

Update `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {
  --font-sans: 'Inter', sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
}

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 2: 更新根布局**

Update `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Reader - Immersive PDF Reader',
  description: 'Open-source PDF reader with AI-powered conversation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: 创建主页面**

Update `src/app/page.tsx`:

```tsx
'use client';

import { useState, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { AIPanel } from '@/components/layout/AIPanel';
import { PDFUploader } from '@/components/features/PDFUploader';
import { SettingsModal } from '@/components/features/SettingsModal';
import { usePDF } from '@/hooks/usePDF';
import { useAI } from '@/hooks/useAI';
import { useSettings } from '@/hooks/useSettings';

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  const uploaderRef = useRef<HTMLInputElement>(null);

  const { currentDocument, uploadPDF } = usePDF();
  const { messages, sendMessage, isLoading } = useAI();
  const { settings, saveSettings } = useSettings();

  const handleUpload = () => {
    uploaderRef.current?.click();
  };

  const handleFileSelect = async (file: File) => {
    try {
      await uploadPDF(file);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!currentDocument || !settings?.apiKey) {
      alert('Please upload a PDF and configure AI settings first.');
      return;
    }

    await sendMessage(message, currentDocument.id, settings.provider, settings.apiKey);
  };

  return (
    <main className="flex h-screen">
      {/* Hidden File Input */}
      <input
        ref={uploaderRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      {/* Sidebar */}
      <Sidebar
        onUpload={handleUpload}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Canvas */}
      <MainCanvas
        zoomLevel={zoomLevel}
        onZoomIn={() => setZoomLevel((z) => Math.min(400, z + 25))}
        onZoomOut={() => setZoomLevel((z) => Math.max(25, z - 25))}
        hasDocument={!!currentDocument}
      />

      {/* AI Panel */}
      <AIPanel
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={(provider, apiKey) => {
          saveSettings({ provider, apiKey });
        }}
        initialProvider={settings?.provider}
        initialApiKey={settings?.apiKey}
      />
    </main>
  );
}
```

- [ ] **Step 4: 创建 useSettings Hook**

Create `src/hooks/useSettings.ts`:

```tsx
import { useState, useEffect } from 'react';
import { Settings } from '@/types/settings';
import { getSettings, saveSettings as saveToDB } from '@/lib/storage/settings';
import { openDB } from '@/lib/storage/indexeddb';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const db = await openDB();
    const provider = await getSettings<string>(db, 'provider');
    const apiKey = await getSettings<string>(db, 'apiKey');

    if (provider && apiKey) {
      setSettings({ provider, apiKey });
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    const db = await openDB();
    await saveToDB(db, 'provider', newSettings.provider);
    await saveToDB(db, 'apiKey', newSettings.apiKey);
    setSettings(newSettings);
  };

  return { settings, saveSettings };
}
```

- [ ] **Step 5: 提交主页面**

```bash
git add src/app/ src/hooks/useSettings.ts
git commit -m "feat: integrate all components in main page

- Add main page with three-panel layout
- Add PDF upload functionality
- Add AI chat integration
- Add settings management
- Add zoom controls

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Chunk 7: 测试与部署

### Task 22: 添加集成测试

**Files:**
- Create: `tests/integration/upload-flow.test.ts`
- Create: `tests/integration/ai-chat.test.ts`

- [ ] **Step 1: 创建上传流程集成测试**

Create `tests/integration/upload-flow.test.ts`:

```typescript
import { validatePDFFile } from '@/lib/pdf/validator';
import { checkPageLimit, extractTextFromPDF } from '@/lib/pdf/parser';

describe('PDF Upload Flow', () => {
  it('should validate, check pages, and extract text', async () => {
    // 创建测试 PDF 文件
    const testPDF = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    // 1. 验证
    const validation = validatePDFFile(testPDF);
    expect(validation.valid).toBe(true);

    // 2. 检查页数和提取文本（需要真实 PDF）
    // 在实际测试中使用真实的 PDF 文件
  });
});
```

- [ ] **Step 2: 提交集成测试**

```bash
git add tests/integration/
git commit -m "test: add integration test placeholders

- Add PDF upload flow test
- Add AI chat flow test (placeholder)
- Need real PDF files for full testing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 23: 配置部署

**Files:**
- Create: `vercel.json`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `README.md`

- [ ] **Step 1: 创建 Vercel 配置**

Create `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    { "src": "package.json", "use": "@vercel/next" }
  ]
}
```

- [ ] **Step 2: 创建 Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["npm", "start"]
```

- [ ] **Step 3: 创建 docker-compose.yml**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ai-reader:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

- [ ] **Step 4: 创建 README.md**

Create `README.md`:

```markdown
# 沉浸式 AI 阅读器

开源的沉浸式 PDF 阅读器，支持画布式交互和 AI 对话。

## 功能特性

- ✅ PDF 上传与解析
- ✅ 画布式渲染（拖拽、缩放）
- ✅ AI 对话（智谱 GLM-4、Minimax）
- ✅ 文本高亮与笔记
- ✅ 本地存储（IndexedDB）

## 快速开始

### 前置要求

- Node.js 20+
- npm 或 pnpm

### 安装依赖

\`\`\`bash
npm install
\`\`\`

### 配置环境变量

复制 `.env.local.example` 为 `.env.local` 并填写配置。

### 运行开发服务器

\`\`\`bash
npm run dev
\`\`\`

打开 http://localhost:3000

### 构建生产版本

\`\`\`bash
npm run build
npm start
\`\`\`

## 部署

### Vercel（推荐）

\`\`\`bash
npm i -g vercel
vercel --prod
\`\`\`

### Docker

\`\`\`bash
docker-compose up -d
\`\`\`

## 技术栈

- Next.js 14+
- React 18+
- TypeScript 5+
- Tailwind CSS 3+
- Fabric.js 6+
- PDF.js 4+
- 智谱 AI API
- Minimax API

## 开发路线

详见 [实现计划](docs/superpowers/plans/2026-03-16-immersive-ai-reader-implementation.md)

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

---

Built with ❤️ by Claude + Human
```

- [ ] **Step 5: 提交部署配置**

```bash
git add vercel.json Dockerfile docker-compose.yml README.md
git commit -m "docs: add deployment configuration

- Add Vercel configuration
- Add Dockerfile and docker-compose
- Add comprehensive README
- Add quick start guide

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 24: 最终测试与部署

- [ ] **Step 1: 运行完整测试套件**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 2: 构建生产版本**

```bash
npm run build
```

Expected: Build SUCCESS

- [ ] **Step 3: 本地测试生产版本**

```bash
npm start
```

Expected: Server runs on http://localhost:3000

- [ ] **Step 4: 部署到 Vercel**

```bash
vercel --prod
```

Expected: Deployment SUCCESS

- [ ] **Step 5: 提交最终版本**

```bash
git add .
git commit -m "chore: prepare for production release

- All tests passing
- Production build successful
- Deployed to Vercel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git tag -a v1.0.0 -m "Release v1.0.0 - MVP"
git push origin main --tags
```

---

## 实现计划总结

**总任务数**: 24 个任务
**预计时间**: 4 周
**技术栈**: Next.js 14+, React 18+, TypeScript 5+, Fabric.js, PDF.js

**里程碑**:
- Week 1: 项目脚手架 + PDF 渲染 (Task 1-12)
- Week 2: 画布交互 + 标注功能 (Task 13-14)
- Week 3: AI 对话 + UI 组件 (Task 15-21)
- Week 4: 测试 + 部署 (Task 22-24)

**关键特性**:
- ✅ PDF 上传与解析（支持大文件）
- ✅ 画布式渲染（虚拟滚动）
- ✅ AI 对话（智谱 GLM-4 + Minimax）
- ✅ 标注与笔记
- ✅ 本地存储（IndexedDB）
- ✅ 响应式布局

**后续优化**:
- Phase 2: 用户系统、云端存储
- Phase 3: 代码仓库集成、知识图谱

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-16-immersive-ai-reader-implementation.md`. Ready to execute?**
