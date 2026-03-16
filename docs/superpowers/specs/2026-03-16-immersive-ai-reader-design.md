# 沉浸式 AI 阅读器 - 设计规范文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 项目名称 | 沉浸式 AI 阅读器（Immersive AI Reader） |
| 版本 | v1.0 MVP |
| 创建日期 | 2026-03-16 |
| 设计状态 | 待实现 |
| 设计者 | Claude + 用户 |

---

## 1. 项目概述

### 1.1 产品定位

一个开源的沉浸式 PDF 阅读器，通过画布式交互和 AI 对话，提供非线性的文档阅读体验。支持用户使用自己的 AI API Key（智谱 GLM、Minimax）。

### 1.2 核心价值

- **画布式阅读**：打破线性阅读限制，支持自由布局和探索
- **AI 深度理解**：基于文档上下文的智能问答
- **标注与笔记**：高亮关键内容，添加个人笔记
- **开源免费**：用户使用自己的 API Key，无订阅费用

### 1.3 MVP 范围

**包含功能：**
- ✅ PDF 上传与解析
- ✅ 画布式渲染（拖拽、缩放）
- ✅ AI 对话（基于文档内容）
- ✅ 文本高亮与笔记
- ✅ AI Provider 配置（智谱 GLM、Minimax）

**不包含（后续版本）：**
- ❌ 用户系统（登录/注册）
- ❌ 云端存储（数据仅存本地）
- ❌ 代码仓库集成
- ❌ 知识图谱
- ❌ 多人协作

---

## 2. 技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────┐
│        前端（Next.js 14+）                   │
│  ┌─────────────────────────────────────┐   │
│  │  PDF 画布（Fabric.js + PDF.js）      │   │
│  │  AI 对话面板（React Components）      │   │
│  │  标注工具栏（Radix UI）               │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  本地存储（IndexedDB + LocalStorage） │   │
│  └─────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │ HTTPS
┌─────────────────┴───────────────────────────┐
│        后端（Next.js API Routes）            │
│  ┌─────────────────────────────────────┐   │
│  │  /api/chat - AI 对话代理              │   │
│  │  /api/parse-pdf - PDF 文本提取        │   │
│  └─────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────┴───────────────────────────┐
│      外部服务                                │
│  智谱 AI API / Minimax API                  │
└─────────────────────────────────────────────┘
```

### 2.2 技术栈详情

#### 前端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | Next.js | 14+ | 全栈框架，支持 SSR/SSG |
| **UI 库** | React | 18+ | 组件化 UI |
| **语言** | TypeScript | 5+ | 类型安全 |
| **样式** | Tailwind CSS | 3+ | 原子化 CSS |
| **画布** | Fabric.js | 6+ | Canvas 渲染、交互 |
| **PDF** | PDF.js | 4+ | PDF 解析、渲染 |
| **组件** | Radix UI | 2+ | 无样式 UI 组件 |
| **图标** | Lucide React | 0.344+ | 图标库 |
| **字体** | Space Grotesk | - | 标题字体 |
| **字体** | Inter | - | 正文字体 |

#### 后端技术栈

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | 20+ | 服务端运行环境 |
| **框架** | Next.js API Routes | 14+ | API 服务 |
| **AI SDK** | zhipu-sdk | latest | 智谱 AI API |
| **AI SDK** | minimax-sdk | latest | Minimax API |

#### 本地存储

| 技术 | 用途 |
|------|------|
| **IndexedDB** | 存储 PDF 文件、标注数据、笔记 |
| **LocalStorage** | 存储 API Key（加密）、用户设置 |

#### 部署

| 平台 | 用途 |
|------|------|
| **Vercel** | 主部署平台（推荐） |
| **Netlify** | 备选平台 |
| **自托管** | Docker + VPS |

---

## 3. 功能设计

### 3.1 核心功能模块

#### 3.1.1 PDF 上传与解析

**用户流程：**
```
1. 用户点击"Upload PDF"按钮
2. 选择本地 PDF 文件（限制 ≤ 100MB）
3. 前端使用 PDF.js 解析文档
4. 提取页面、文本、元数据
5. 渲染到 Fabric.js 画布
6. 保存到 IndexedDB
```

**技术实现：**
```typescript
// 伪代码
async function uploadPDF(file: File) {
  // 1. 验证文件
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('File size exceeds 100MB limit');
  }

  // 2. 解析 PDF
  const pdfDoc = await pdfjsLib.getDocument(file).promise;

  // 3. 提取文本（用于 AI 分析）
  const textContent = await extractTextFromPDF(pdfDoc);

  // 4. 渲染到画布
  const canvas = new fabric.Canvas('canvas');
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    await renderPageToCanvas(canvas, page, i);
  }

  // 5. 保存到 IndexedDB
  await saveToIndexedDB({
    id: generateId(),
    file: file,
    text: textContent,
    annotations: [],
    createdAt: new Date()
  });
}
```

**数据结构：**
```typescript
interface PDFDocument {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  textContent: string; // 用于 AI 分析
  annotations: Annotation[];
  notes: Note[];
  createdAt: Date;
  updatedAt: Date;
}

interface Annotation {
  id: string;
  pageNumber: number;
  type: 'highlight' | 'underline';
  color: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text: string;
  createdAt: Date;
}

interface Note {
  id: string;
  annotationId: string;
  content: string;
  position: {
    x: number;
    y: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

---

#### 3.1.2 画布交互

**功能列表：**
- 📄 PDF 页面渲染（支持多页）
- 🔍 缩放（25% - 400%）
- 🖱️ 拖拽平移
- 📍 标注高亮（黄色半透明）
- 💬 添加笔记（红色标记）

**交互细节：**

| 操作 | 快捷键/手势 | 响应 |
|------|------------|------|
| 放大 | Ctrl + 滚轮 / 双指捏合 | 平滑缩放，最大 400% |
| 缩小 | Ctrl + 滚轮 / 双指捏合 | 平滑缩放，最小 25% |
| 平移 | 拖拽画布 / 双指滑动 | 实时跟随 |
| 高亮文本 | 选中文本 → 点击高亮按钮 | 黄色半透明遮罩 |
| 添加笔记 | 点击高亮区域 → 输入笔记 | 红色圆形标记 |

**技术实现：**
```typescript
// Fabric.js 初始化
const canvas = new fabric.Canvas('canvas', {
  selection: true,
  backgroundColor: '#E8E8E8',
});

// 缩放控制
function setZoom(zoomLevel: number) {
  canvas.setZoom(zoomLevel);
  canvas.renderAll();
}

// 添加高亮
function addHighlight(bounds: BoundingBox) {
  const highlight = new fabric.Rect({
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fill: '#FEF08A',
    opacity: 0.4,
    selectable: true,
    hasControls: false,
  });
  canvas.add(highlight);
}

// 添加笔记标记
function addNoteMarker(position: Position, noteContent: string) {
  const marker = new fabric.Circle({
    left: position.x,
    top: position.y,
    radius: 12,
    fill: '#E42313',
    selectable: true,
  });

  marker.on('mousedown', () => {
    showNotePopup(noteContent);
  });

  canvas.add(marker);
}
```

---

#### 3.1.3 AI 对话

**用户流程：**
```
1. 用户在右侧 AI 面板输入问题
2. 前端发送请求到 /api/chat
3. 后端调用 AI API（智谱/Minimax）
4. 流式返回答案（SSE）
5. 显示答案，标注引用来源（可选）
```

**API 设计：**

**Request:**
```typescript
POST /api/chat

{
  "message": "What is the main contribution of this paper?",
  "documentId": "doc-123",
  "provider": "zhipu" | "minimax",
  "apiKey": "encrypted-key"
}
```

**Response (SSE):**
```
data: {"content": "The", "done": false}
data: {"content": " main", "done": false}
data: {"content": " contribution", "done": false}
...
data: {"content": "", "done": true}
```

**技术实现：**

```typescript
// 前端：发送对话请求
async function sendChatMessage(message: string) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      documentId: currentDocument.id,
      provider: settings.provider,
      apiKey: decryptApiKey(settings.apiKey),
    }),
  });

  // 处理流式响应
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const data = JSON.parse(chunk.replace('data: ', ''));

    appendToChat(data.content);
  }
}

// 后端：AI 代理
export async function POST(request: Request) {
  const { message, documentId, provider, apiKey } = await request.json();

  // 1. 从 IndexedDB 获取文档内容
  const document = await getDocument(documentId);

  // 2. 构建 Prompt
  const prompt = `
You are an AI assistant helping users understand PDF documents.

Document content:
${document.textContent}

User question: ${message}

Please answer based on the document content.
  `;

  // 3. 调用 AI API
  const stream = await callAIAPI(provider, apiKey, prompt);

  // 4. 流式返回
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function callAIAPI(provider: string, apiKey: string, prompt: string) {
  if (provider === 'zhipu') {
    return await fetch('https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_pro/invoke', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });
  } else if (provider === 'minimax') {
    // Minimax API 调用
  }
}
```

---

#### 3.1.4 标注与笔记

**标注流程：**
```
1. 用户在 PDF 上选中文本
2. 点击工具栏"Highlight"按钮
3. 创建黄色半透明矩形覆盖
4. 保存到 IndexedDB
```

**笔记流程：**
```
1. 用户点击已高亮的区域
2. 弹出笔记输入框
3. 输入笔记内容
4. 保存并显示红色圆形标记
5. 点击标记可查看/编辑/删除笔记
```

**笔记弹窗设计：**
- 位置：高亮区域右侧，避免遮挡
- 内容：笔记文本、创建时间、操作按钮
- 操作：编辑、删除

**数据结构：**
```typescript
interface NotePopup {
  id: string;
  content: string;
  createdAt: Date;
  position: {
    x: number;
    y: number;
  };
  annotationId: string;
}
```

---

#### 3.1.5 设置页面

**配置项：**
1. **AI Provider 选择**
   - 智谱 GLM-4（默认）
   - Minimax

2. **API Key 输入**
   - 密码形式显示
   - 支持显示/隐藏切换
   - 本地加密存储

**交互流程：**
```
1. 用户点击侧边栏"Settings"按钮
2. 弹出设置模态框
3. 选择 AI Provider（Tab 切换）
4. 输入 API Key
5. 点击"Save Settings"
6. 加密保存到 LocalStorage
7. 关闭模态框
```

**安全措施：**
```typescript
// 加密 API Key（简单混淆，非加密）
function encryptApiKey(key: string): string {
  return btoa(key); // Base64 编码
}

function decryptApiKey(encrypted: string): string {
  return atob(encrypted); // Base64 解码
}

// 注意：这不是真正的加密，仅用于混淆
// 生产环境应使用 Web Crypto API
```

---

### 3.2 UI/UX 设计

#### 3.2.1 视觉风格

**设计系统：Swiss Clean Dashboard**

**核心原则：**
- ✅ 极简主义（Less is more）
- ✅ 几何化设计（无圆角）
- ✅ 高对比度（黑白 + 红色强调）
- ✅ 大量留白（48px gap）

**颜色系统：**
```css
/* 背景色 */
--color-bg-page: #FFFFFF;
--color-bg-surface: #FAFAFA;
--color-bg-sidebar: #FFFFFF;

/* 文本色 */
--color-text-primary: #0D0D0D;
--color-text-secondary: #7A7A7A;
--color-text-muted: #B0B0B0;

/* 强调色 */
--color-accent: #E42313; /* 红色 */

/* 边框色 */
--color-border: #E8E8E8;

/* 功能色 */
--color-success: #22C55E;
--color-warning: #FEF08A;
```

**字体系统：**
```css
/* 标题字体 */
font-family: 'Space Grotesk', sans-serif;

/* 正文字体 */
font-family: 'Inter', sans-serif;

/* 字号 */
--font-size-page-title: 40px;
--font-size-section-title: 18px;
--font-size-body: 14px;
--font-size-label: 12px;

/* 字重 */
--font-weight-semibold: 600;
--font-weight-medium: 500;
--font-weight-normal: 400;
```

**间距系统：**
```css
--spacing-section: 48px;
--spacing-card: 24px;
--spacing-element: 16px;
--spacing-compact: 8px;
--spacing-tight: 4px;
```

---

#### 3.2.2 布局设计

**主界面（三栏布局）：**

```
┌──────────────────────────────────────────────────┐
│ 侧边栏 │      画布区域      │  AI 面板  │
│ 280px  │      fill          │  380px    │
│        │                    │           │
│ Logo   │  Toolbar           │  Header   │
│        │  ┌──────────────┐  │           │
│ Upload │  │              │  │  Chat     │
│ Button │  │  PDF Canvas  │  │  Messages │
│        │  │              │  │           │
│ Settings│  └──────────────┘  │           │
│        │                    │  Input    │
└──────────────────────────────────────────────────┘
```

**响应式断点：**
- Desktop: ≥ 1440px（完整三栏）
- Tablet: 768px - 1439px（隐藏 AI 面板，可展开）
- Mobile: < 768px（侧边栏 + AI 面板均为抽屉）

---

#### 3.2.3 交互细节

**1. 文件上传**
- 点击按钮 → 文件选择器
- 拖拽文件到画布区域
- 显示上传进度条
- 成功后自动打开文档

**2. 缩放控制**
- 工具栏：[-] 100% [+]
- 点击 [-] / [+] 按钮步进
- 显示当前缩放比例
- 支持快捷键：Ctrl + +/-/0

**3. 高亮标注**
- 选中文本 → 高亮按钮激活
- 点击按钮 → 添加黄色高亮
- 右键高亮 → 删除 / 添加笔记

**4. 笔记管理**
- 点击红色标记 → 弹出笔记卡片
- 卡片显示：内容、时间、操作
- 点击"Edit" → 进入编辑模式
- 点击"Delete" → 确认后删除

**5. AI 对话**
- 输入框支持多行（Shift + Enter）
- 发送后显示加载状态
- 流式显示答案（逐字打印）
- 支持复制答案

**6. 设置弹窗**
- Tab 切换 Provider
- API Key 输入框支持粘贴
- 显示/隐藏密码切换
- 保存后显示成功提示

---

## 4. 数据模型

### 4.1 IndexedDB Schema

```typescript
// 数据库结构
const DB_NAME = 'ai-reader-db';
const DB_VERSION = 1;

// 对象存储（表）
const stores = {
  documents: {
    keyPath: 'id',
    indexes: ['createdAt', 'fileName']
  },
  annotations: {
    keyPath: 'id',
    indexes: ['documentId', 'pageNumber']
  },
  notes: {
    keyPath: 'id',
    indexes: ['annotationId', 'createdAt']
  },
  settings: {
    keyPath: 'key'
  }
};

// Document 表
interface DocumentRecord {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  textContent: string; // 用于 AI 分析
  fileBlob: Blob; // PDF 文件二进制
  createdAt: Date;
  updatedAt: Date;
}

// Annotation 表
interface AnnotationRecord {
  id: string;
  documentId: string;
  pageNumber: number;
  type: 'highlight';
  color: string;
  position: BoundingBox;
  text: string;
  createdAt: Date;
}

// Note 表
interface NoteRecord {
  id: string;
  annotationId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

// Settings 表
interface SettingsRecord {
  key: string;
  value: any;
}
```

### 4.2 LocalStorage Schema

```typescript
// API Key 存储（加密）
localStorage.setItem('ai-provider', 'zhipu');
localStorage.setItem('api-key-encrypted', btoa('your-api-key'));

// 用户偏好
localStorage.setItem('theme', 'light');
localStorage.setItem('zoom-level', '1.0');
```

---

## 5. API 设计

### 5.1 后端 API 端点

#### POST /api/chat

**描述：** AI 对话代理

**Request:**
```json
{
  "message": "string",
  "documentId": "string",
  "provider": "zhipu" | "minimax",
  "apiKey": "string",
  "conversationHistory": [
    { "role": "user", "content": "string" },
    { "role": "assistant", "content": "string" }
  ]
}
```

**Response (SSE):**
```
data: {"content": "string", "done": false}
```

**Status Codes:**
- 200: 成功
- 400: 请求参数错误
- 401: API Key 无效
- 500: 服务器错误

---

#### POST /api/parse-pdf

**描述：** 解析 PDF 文本（可选，前端可直接处理）

**Request:**
```json
{
  "file": "File (multipart/form-data)"
}
```

**Response:**
```json
{
  "textContent": "string",
  "metadata": {
    "title": "string",
    "author": "string",
    "pageCount": "number"
  }
}
```

---

### 5.2 外部 API 集成

#### 智谱 AI API

**端点：** `https://open.bigmodel.cn/api/paas/v3/model-api/chatglm_pro/invoke`

**认证：** Bearer Token

**请求示例：**
```json
{
  "model": "glm-4",
  "messages": [
    { "role": "user", "content": "string" }
  ],
  "stream": true
}
```

#### Minimax API

**端点：** `https://api.minimax.chat/v1/text/chatcompletion_v2`

**认证：** Bearer Token

**请求示例：**
```json
{
  "model": "abab6.5-chat",
  "messages": [
    { "role": "user", "content": "string" }
  ],
  "stream": true
}
```

---

## 6. 性能优化

### 6.1 前端优化

**1. PDF 渲染优化**
```typescript
// 虚拟滚动：只渲染可视区域的页面
function renderVisiblePages() {
  const visiblePages = getVisiblePages();
  visiblePages.forEach(page => renderPage(page));
}

// 页面缓存
const pageCache = new Map<number, ImageData>();
```

**2. 画布性能**
```typescript
// 降低渲染频率
fabric.Canvas.prototype.renderOnAddRemove = false;

// 批量操作
canvas.renderAll();
```

**3. IndexedDB 优化**
```typescript
// 使用事务批量写入
const transaction = db.transaction(['annotations'], 'readwrite');
const store = transaction.objectStore('annotations');
annotations.forEach(anno => store.add(anno));
```

### 6.2 后端优化

**1. AI API 流式响应**
```typescript
// 使用 SSE 减少首字延迟
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream' }
});
```

**2. 文档内容缓存**
```typescript
// 内存缓存最近访问的文档
const documentCache = new LRUCache<string, string>({
  max: 100,
  maxAge: 1000 * 60 * 30, // 30 minutes
});
```

---

## 7. 安全性

### 7.1 API Key 安全

**存储安全：**
```typescript
// ❌ 不推荐：明文存储
localStorage.setItem('api-key', 'sk-xxx');

// ✅ 推荐：加密存储
function saveApiKey(key: string) {
  const encrypted = btoa(key); // Base64 编码（混淆）
  localStorage.setItem('api-key-encrypted', encrypted);
}

// 🔒 最佳实践：使用 Web Crypto API
async function encryptApiKey(key: string, password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) },
    cryptoKey,
    data
  );

  return encrypted;
}
```

**传输安全：**
- ✅ 仅在 HTTPS 下运行
- ✅ API Key 仅发送到后端代理，不直接暴露给前端
- ✅ 后端验证 API Key 格式

### 7.2 文件上传安全

**验证：**
```typescript
function validatePDFFile(file: File) {
  // 1. 文件类型
  if (file.type !== 'application/pdf') {
    throw new Error('Only PDF files are allowed');
  }

  // 2. 文件大小
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('File size exceeds 100MB limit');
  }

  // 3. 文件名（防止路径遍历）
  if (file.name.includes('..') || file.name.includes('/')) {
    throw new Error('Invalid file name');
  }
}
```

### 7.3 XSS 防护

**输入净化：**
```typescript
import DOMPurify from 'dompurify';

function sanitizeUserInput(input: string): string {
  return DOMPurify.sanitize(input);
}
```

**输出编码：**
```tsx
// React 自动转义
<div>{userContent}</div>

// 或使用 dangerouslySetInnerHTML（不推荐）
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

---

## 8. 错误处理

### 8.1 错误类型

| 错误类型 | 示例 | 处理方式 |
|---------|------|---------|
| **网络错误** | AI API 超时 | 重试 + 提示用户 |
| **文件错误** | PDF 解析失败 | 显示错误信息 |
| **验证错误** | API Key 格式错误 | 前端验证 + 提示 |
| **存储错误** | IndexedDB 满了 | 清理旧数据 |

### 8.2 错误边界

```tsx
// React Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

### 8.3 用户友好提示

```typescript
// Toast 通知
function showError(message: string) {
  toast.error(message, {
    duration: 5000,
    position: 'top-right',
  });
}

// 示例
try {
  await uploadPDF(file);
  toast.success('PDF uploaded successfully!');
} catch (error) {
  showError('Failed to upload PDF: ' + error.message);
}
```

---

## 9. 测试策略

### 9.1 单元测试

**工具：** Jest + React Testing Library

**测试范围：**
- PDF 解析逻辑
- 标注数据处理
- API Key 加密/解密
- 工具函数

**示例：**
```typescript
describe('PDF Parser', () => {
  it('should extract text from PDF', async () => {
    const file = new File(['pdf content'], 'test.pdf');
    const text = await extractTextFromPDF(file);
    expect(text).toContain('expected content');
  });
});
```

### 9.2 集成测试

**工具：** Playwright / Cypress

**测试场景：**
- 用户上传 PDF → 验证渲染
- 添加高亮和笔记 → 验证保存
- AI 对话 → 验证响应

**示例：**
```typescript
test('user can upload PDF and add annotation', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type="file"]', 'test.pdf');
  await page.waitForSelector('.pdf-page');

  // 添加高亮
  await page.click('[data-testid="highlight-btn"]');
  await page.mouse.dblclick(100, 100);

  // 验证高亮存在
  const highlight = await page.waitForSelector('.annotation-highlight');
  expect(highlight).toBeTruthy();
});
```

### 9.3 E2E 测试

**测试流程：**
1. 完整的用户旅程测试
2. 设置 AI Provider
3. 上传 PDF
4. 与 AI 对话
5. 添加标注和笔记
6. 刷新页面验证数据持久化

---

## 10. 部署

### 10.1 Vercel 部署（推荐）

**步骤：**
```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署
vercel --prod

# 4. 配置环境变量（可选）
vercel env add AI_PROVIDER_DEFAULT
vercel env add MAX_FILE_SIZE
```

**vercel.json 配置：**
```json
{
  "version": 2,
  "builds": [
    { "src": "package.json", "use": "@vercel/next" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" }
  ]
}
```

### 10.2 自托管部署（Docker）

**Dockerfile:**
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

**docker-compose.yml:**
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

**运行：**
```bash
docker-compose up -d
```

---

## 11. 监控与日志

### 11.1 前端监控

**工具：** Sentry / LogRocket

**监控项：**
- JavaScript 错误
- 性能指标（FCP, LCP）
- 用户行为

### 11.2 后端日志

**日志格式：**
```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: 'AI chat request',
  metadata: {
    documentId: 'xxx',
    provider: 'zhipu',
    responseTime: '1234ms'
  }
}));
```

---

## 12. 未来扩展

### 12.1 Phase 2（用户系统）

**功能：**
- 用户注册/登录
- 云端存储（PostgreSQL + S3）
- 跨设备同步
- 文档分享

**技术：**
- NextAuth.js（认证）
- PostgreSQL（数据）
- AWS S3 / Vercel Blob（文件）

### 12.2 Phase 3（高级功能）

**功能：**
- 代码仓库集成（GitHub）
- 知识图谱
- 多人协作
- 移动端 App（React Native）

---

## 13. 开发计划

### 13.1 里程碑

| 阶段 | 时间 | 目标 |
|------|------|------|
| **Week 1** | 3 天 | 项目脚手架 + PDF 渲染 |
| **Week 2** | 5 天 | 画布交互 + 标注功能 |
| **Week 3** | 5 天 | AI 对话 + 设置页面 |
| **Week 4** | 2 天 | 测试 + 部署 |

### 13.2 开发优先级

**P0（必须有）：**
1. PDF 上传与渲染
2. 画布拖拽缩放
3. AI 对话（智谱 GLM）
4. 基础标注功能

**P1（应该有）：**
1. Minimax API 支持
2. 笔记功能
3. 设置页面
4. 本地存储

**P2（可以有）：**
1. 多语言支持
2. 主题切换
3. 导出功能
4. 快捷键

---

## 14. 参考资料

### 14.1 技术文档

- [Next.js Documentation](https://nextjs.org/docs)
- [Fabric.js Tutorial](http://fabricjs.com/articles/)
- [PDF.js Guide](https://mozilla.github.io/pdf.js/)
- [Radix UI Components](https://www.radix-ui.com/primitives)

### 14.2 AI API 文档

- [智谱 AI API 文档](https://open.bigmodel.cn/dev/api)
- [Minimax API 文档](https://www.minimaxi.com/document/)

### 14.3 设计参考

- [Swiss Design Style](https://www.smashingmagazine.com/2020/10/swiss-style-design-principles/)
- [Vibero.dev](https://vibero.dev/)

---

## 15. 附录

### 15.1 术语表

| 术语 | 定义 |
|------|------|
| **画布** | 基于 Fabric.js 的无限画布，用于渲染 PDF |
| **标注** | 用户在 PDF 上添加的高亮标记 |
| **笔记** | 附加在标注上的文本内容 |
| **Provider** | AI 服务提供商（智谱/Minimax） |

### 15.2 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-03-16 | v1.0 | 初始设计文档 |

---

**文档结束**

*本设计文档将根据开发进度和用户反馈持续更新。*
