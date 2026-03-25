# Focus Mode 详细设计规范

> **文档版本**：v2.2
> **日期**：2026-03-25
> **基于**：PRD v2.2
> **状态**：待实现
>
> **更新记录**：
> - v2.2：修正章节编号（4.2 重复、5.0 笔误），补充 L1 持久化策略、L2 浮层滚动行为、NoteAnnotation.isPermanent/isPinned 字段、SourceAnchor.readingSessionId 来源说明
> - v2.1：修正坐标转换公式、添加 L1/L2/L3 在两种模式的差异说明、修正 Cmd+Shift+B 快捷键、添加 FocusStatusBar 定位、补充 saveProgressDebounced 和 checkSummaryTrigger 定义
> - v2.0：完整版，覆盖全部子系统

---

## 一、功能概述

### 1.1 什么是 Focus Mode

Focus Mode 是一种「认知仪式」——用户主动宣告进入深度阅读状态，系统减少一切非必要 UI 干扰，激活选文本捕获链路，让用户在最小打断中完成阅读 → 思考 → 记录的闭环。

与 Free Mode 的定位对比：

| 维度 | Free Mode | Focus Mode |
|------|-----------|------------|
| 侧边栏 | 展开 | 完全收起 |
| AI Panel | 完整面板（380px+） | 仅悬浮按钮 |
| 工具条 | 完整工具条 | 极简工具条 |
| 捕获面板 | 常驻左侧 Tab | 收起，点击按钮展开左侧抽屉 |
| 选中文本 | 触发 L2 浮层 | 触发 L1 高亮 + L2 浮层 |
| 双击高亮 | 触发 L3 编辑器 | 触发 L3 编辑器 |
| 阅读进度 | 不记录 | 记录，并可恢复 |
| 适用场景 | 浏览、多任务、快速查找 | 深度阅读、知识捕获、沉浸思考 |

> **说明**：L2/L3 在 Free Mode 和 Focus Mode 下均可触发，差异在于：
> - Focus Mode：更紧凑的 UI、更少的动画、L1 自动高亮辅助感知
> - Free Mode：L2 浮层尺寸稍大，提供更完整的操作提示

### 1.2 Focus Mode 包含的所有功能

Focus Mode 不是单一的「切换」功能，而是一整套相互配合的子系统：

```
Focus Mode 激活
  ├── UI 层：侧边栏收起、AI Panel 收缩、极简工具条
  ├── 捕获层：L1 自动高亮 + L2 AI 即时交互 + L3 深度笔记
  ├── 面板层：mini AI 窗口 + 捕获记录抽屉
  ├── 进度层：像素进度检测 → 80% 摘要触发
  ├── 状态层：Focus Session 记录 → 退出恢复 → 再次进入恢复提示
  └── 快捷键层：Mode 专属快捷键体系
```

### 1.3 核心用户流程

```
打开文档（Free Mode 默认）
  → 选中文本、标注、与 AI 对话
  → 用户主动进入 Focus Mode（Cmd+Shift+F 或工具条按钮）
  → 系统激活完整捕获链路
  → 阅读过程中：L1 高亮自动记录、L2 即时 AI 响应、L3 深度笔记
  → 退出 Focus Mode（Escape）
  → 系统保存：FocusSession（页码、scrollTop、捕获统计、摘要状态）
  → 回到 Free Mode

  … later …

  再次打开同一文档
  → 系统查询最近一次 FocusSession
  → 满足条件则显示恢复提示（「继续专注」/「不用」）
  → 用户选择后对应进入 Focus Mode 或保持 Free Mode
```

---

## 二、UI 详细设计

### 2.1 进入时的 UI 变化

#### 动画

```
时长：300ms
缓动：ease-in-out

0-150ms：   侧边栏向左滑出 + 淡出（opacity 1→0）
150-300ms： AI Panel 收缩为悬浮按钮 + PDF 区域扩展
```

#### 各区域变化

**侧边栏**
- 宽度 240px → 0px，内容向左滑出并淡出
- 进入后 `display: none`，DOM 仍存在（切换时重新渲染）

**AI Panel**
- 完整面板 → 收起为右下角悬浮按钮
- 按钮：圆形，56px，背景 `bg-primary`，图标 🤖
- 右上角叠加红色徽章（未读消息数，有消息时显示）

**PDF 阅读区域**
- 宽度扩展至 `calc(100% - 48px)`（留出 AI 按钮位）
- 平滑扩展，无闪烁

**工具条**
- 按钮精简：移除 Library 按钮
- 保留：缩放、页码、搜索、Focus Mode 切换
- 新增左侧：捕获记录按钮 📋（280px 抽屉入口）

### 2.2 退出时的 UI 变化

#### 触发方式

| 触发方式 | 行为 |
|----------|------|
| `Escape` 键 | 退出 Focus Mode，回到 Free Mode |
| 工具条「退出专注」按钮 | 同上 |
| `Cmd+Shift+F` | 同上（快捷键） |

#### 退出流程

```
用户按 Escape / 点击退出按钮
  ↓
保存 Focus Session 到数据库（页码、scrollTop、捕获统计、摘要状态）
  ↓
关闭 mini AI 窗口（如打开）
  ↓
关闭捕获抽屉（如打开）
  ↓
动画：侧边栏滑入 + AI Panel 展开 + PDF 收缩
  ↓
回到 Free Mode
```

#### 退出动画

```
时长：250ms，缓动：ease-in-out

0-125ms：   侧边栏从左侧滑入 + 淡入
125-250ms： AI Panel 从按钮扩展 + PDF 收缩
```

### 2.3 Focus Mode 完整 UI 布局

```
┌────────────────────────────────────────────────────────────────────┐
│ [📋] [───── 极简工具条 ─────] [100%] [p.3/20] [🔍] [🚪]         │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│                                                                   │
│                        PDF 阅读区域                                 │
│                                                                   │
│     ┌─────────────┐ ← L2 AI 浮层（选中文字后出现）                 │
│     │ 🤖 解释     │                                               │
│     │ 🌐 翻译     │                                               │
│     │ 💬 加入会话  │                                               │
│     │ 📝 新建笔记  │                                               │
│     └─────────────┘                                               │
│                                                                   │
│                                                                   │
│   ┌──────────────────────┐ ← L3 深度笔记编辑器（双击高亮后出现）   │
│   │ 第 3 页 · 来自高亮    │                                        │
│   │ [标签输入]            │                                        │
│   │ ┌──────────────────┐ │                                        │
│   │ │ 笔记正文...       │ │                                        │
│   │ └──────────────────┘ │                                        │
│   │ [取消]  [保存]       │                                        │
│   └──────────────────────┘                                        │
│                                                                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

                                          ┌───┐
                                          │ 🤖 │  ← 悬浮按钮
                                          └───┘

┌─ 捕获记录抽屉（从左侧滑出）──────────────────────────┐
│ 📋 捕获记录                              [×]          │
│ [全部] [笔记] [高亮] [AI]                            │
│ [✨ 一键合成]（7 条捕获）                              │
│                                                     │
│ 2024-03-25                                        │
│  ├─ 14:32                                         │
│  │   └─ 📝 笔记：Self-attention 的优势…          │
│  │   └─ 🤖 AI 回复：Transformer 的并行计算…       │
│  └─ 14:28                                         │
│      └─ 🔵 高亮：「完全基于注意力机制」            │
└─────────────────────────────────────────────────────┘

┌─ mini AI 窗口（从右侧滑出）─────────────────────────┐
│ 🤖 AI 助手                                 [─] [×]  │
│                                                     │
│ [User] self-attention 是什么？                      │
│                                                     │
│ [AI] Self-attention 是让序列内任意位置直接建立       │
│ 关联的机制…[ref:p3] [ref:p5]                       │
│                                                     │
│ （消息列表，可滚动）                                 │
├─────────────────────────────────────────────────────┤
│ [📎 原文] [💾 保存]                                 │
│ ┌────────────────────────────────────────┐         │
│ │ 输入问题...                              │         │
│ └────────────────────────────────────────┘         │
│                              [发送 ↗]              │
└─────────────────────────────────────────────────────┘

底部状态栏：
[📄 p.3/20]  [▓▓▓░░░░░░░ 15%]  [⏱ 12:34]
```

**状态栏位置**：固定在 PDF 滚动容器底部（`position: sticky; bottom: 0`），随 PDF 滚动但始终可见。Free Mode 下不显示此状态栏。

### 2.4 工具条按钮配置

**Free Mode 工具条**
```
[📚 Library] [────── 极简工具条 ──────] [缩放] [页码] [搜索] [🤖 AI]
```

**Focus Mode 极简工具条**
```
[📋 捕获] [────── 极简工具条 ──────] [缩放] [页码] [搜索] [🚪 退出]
```

切换时按钮有 150ms 的交叉淡入淡出动画，避免突兀跳变。

### 2.5 首次使用提示

用户首次进入 Focus Mode 时（`localStorage` 中无 `focus_mode_intro_seen`），在工具条右侧显示 Tooltip，持续 5 秒后自动消失：

```
选中文本即可触发 AI 解释和高亮捕获
                        [知道了]
```

用户点击「知道了」或 Tooltip 自动消失后，`localStorage.setItem('focus_mode_intro_seen', 'true')`。

---

## 三、L1 自动高亮

### 3.0 L1 在 Free Mode 的行为

Free Mode 下选中文本，不显示 L1 气泡按钮，不自动记录高亮。

Free Mode 的选中文本行为由 L2 层处理（见第四章）。

---

### 3.1 触发

**触发时机**：`mouseup` 或 `touchend` 事件中检测到用户在 PDF 文本层有选区。

**判断逻辑**：

```typescript
document.addEventListener('mouseup', (e) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return; // 无选区

  // 确保选区在 PDF 文本层内
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!isPDFFileTextLayer(anchorNode) || !isPDFFileTextLayer(focusNode)) return;

  // 确保不是正在拖拽（防止误触发）
  if (isDraggingRef.current) return;

  // 触发 L1 高亮
  handleAutoHighlight(selection);
});
```

### 3.2 高亮渲染

**高亮层**：在 PDF 页面 DOM 上覆盖一层透明 `div`，高亮作为绝对定位的 `div` 叠加其上。

```typescript
function renderHighlight(textRange: TextRange, pageNumber: number) {
  const highlight = document.createElement('div');
  highlight.className = 'l1-highlight';
  highlight.dataset.annotationId = annotationId;

  const cssX = textRange.x * scale;
  const cssY = pageHeight - textRange.y - textRange.height;
  const cssW = textRange.width * scale;
  const cssH = textRange.height * scale;

  highlight.style.cssText = `
    position: absolute;
    left: ${cssX}px;
    top: ${cssY}px;
    width: ${cssW}px;
    height: ${cssH}px;
    background: rgba(59, 130, 246, 0.2);
    border-radius: 2px;
    pointer-events: none;
    animation: highlight-appear 150ms ease-out forwards;
  `;

  pageHighlightLayer.appendChild(highlight);
}

@keyframes highlight-appear {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### 3.3 选中文本 → textRange 转换

**目的**：将 DOM Selection 的浏览器坐标转换为 PDF 页面坐标。

```typescript
interface TextItem {
  x: number;      // PDF 原始坐标（pt）
  y: number;      // PDF 原始坐标（pt）
  width: number;  // PDF pt
  height: number; // PDF pt
  text: string;
}

interface TextRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

function selectionToTextRange(
  selection: Selection,
  pageViewport: { width: number; height: number; scale: number }
): TextRange {
  const range = selection.getRangeAt(0);

  // 1. 获取 DOM 选区的边界矩形（浏览器坐标）
  const rects = range.getClientRects();
  if (rects.length === 0) throw new Error('No selection rects');

  // 2. 合并多段选区（用户可能跨多行选）
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];

  // 3. 获取第一个文本节点的父元素（pdfjs 的 text layer div）
  const container = findPDFTextLayer(range.commonAncestorContainer);
  const containerRect = container.getBoundingClientRect();

  // 4. 浏览器坐标 → 页面相对坐标
  const relX = firstRect.left - containerRect.left;
  const relY = firstRect.top - containerRect.top;
  const relRight = lastRect.right - containerRect.left;
  const relBottom = lastRect.bottom - containerRect.top;

  // 5. 相对坐标 → PDF 视口坐标（除以 scale 还原为原始 pt）
  const vpX = relX / pageViewport.scale;
  const vpY = relY / pageViewport.scale;
  const vpRight = relRight / pageViewport.scale;
  const vpBottom = relBottom / pageViewport.scale;

  // 6. PDF 视口坐标（top-left 原点）→ textRange
  // PDF y 原点是左下角，需要转换
  // pageViewport.height 除以 scale 得到原始 PDF 页面高度（pt）
  const pageHeight = pageViewport.height / pageViewport.scale;
  // vpX/vpRight/vpBottom/vpY 均是 PDF 原始 pt 单位，与 pageHeight 一致

  return {
    x: vpX,
    y: pageHeight - vpBottom,  // bottom-left 原点 → top-left 原点
    width: vpRight - vpX,
    height: vpBottom - vpY,
  };
}
```

### 3.4 气泡按钮

**样式**：

```
位置：紧贴选区右侧，选区上方空间不足时显示在下方
尺寸：宽 48px，高 36px
背景：bg-white，阴影 shadow-md，圆角 8px
动画：从上方滑入 100ms

┌────────────────┐
│       +        │  ← 简洁加号，表示「添加到捕获」
└────────────────┘
```

**行为**：
- Focus Mode 选中文本后 50ms 出现（等待选区稳定）
- 2 秒无操作自动消失
- 点击后立即消失，触发 L2 浮层
- PDF 滚动时立即消失（选区已不在可见区域）
- Free Mode 下不显示此气泡（直接触发 L2 浮层）

### 3.5 高亮防抖和合并

**防抖**：同一选区 1 秒内的重复触发忽略。

```typescript
const DEBOUNCE_MS = 1000;
const lastHighlightKey = { pageNumber: number, text: string };
let lastHighlightTime = 0;

function handleAutoHighlight(selection: Selection) {
  const text = selection.toString().trim();
  if (!text) return;

  const key = getSelectionKey(selection); // 基于 pageNumber + 字符偏移
  const now = Date.now();

  if (key === lastHighlightKey && now - lastHighlightTime < DEBOUNCE_MS) {
    return; // 防抖
  }

  lastHighlightKey = key;
  lastHighlightTime = now;

  createHighlight(selection);
}
```

**合并**：选区与已有高亮重叠 > 80% 时，合并为一个高亮，不重复记录。

```typescript
function shouldMergeWithExisting(
  newRange: TextRange,
  existingRanges: TextRange[]
): TextRange | null {
  for (const existing of existingRanges) {
    const overlap = rectOverlap(newRange, existing);
    const overlapRatio = overlap / (newRange.width * newRange.height);
    if (overlapRatio > 0.8) {
      // 合并两个矩形
      return mergeRects(newRange, existing);
    }
  }
  return null;
}
```

### 3.6 边界情况

| 情况 | 处理 |
|------|------|
| 选区跨页 | 只高亮当前页部分，气泡提示「跨页选区已截断」 |
| 选区在已有高亮上 | 合并为同一高亮，不产生两个记录 |
| 快速滑动时松开 | 忽略，不触发任何操作（通过 `isDraggingRef` 判断） |
| 选区为空 | 静默忽略，无 UI 反馈 |
| 选区只有空白字符 | 静默忽略 |

### 3.7 持久化策略

L1 高亮默认存储在 **SQLite**（与 L2/L3 笔记统一存储），而非仅内存持有。原因：
- 用户退出 Focus Mode 或关闭文档后，再次进入仍能看到已高亮内容
- FocusSession 退出时统计 `highlightsCount` 需要准确数据
- 与现有 `annotations` 表结构完全兼容（`type: 'highlight'`）

唯一例外：选区触发后 300ms 内用户还未点击任何按钮，且触发了新的选区 → 旧选区产生的 L1 高亮直接丢弃（用户没有主动确认意图）。

---

## 四、L2 即时 AI 交互

### 4.1 触发

**Focus Mode 触发**：用户点击 L1 气泡按钮（+）

**Free Mode 触发**：选中文本后，L2 浮层直接出现（无需点击气泡）

**选中文本不消失**：触发 L2 后，原有的浏览器 Selection 保持（用户仍能看到选区），选区内容作为 L2 浮层的上下文。

**滚动时浮层处理**：L2 浮层以 `position: fixed` 挂载在 `document.body`，跟随视口固定定位。滚动 PDF 时，浮层不受影响，始终保持在选区旁边。如选区已滚出视口，浮层保持当前位置（用户滚动回来后自然对齐）。

### 4.2 两种模式下的 L2 差异

| 维度 | Free Mode | Focus Mode |
|------|-----------|------------|
| 浮层尺寸 | 宽 220px（稍大） | 宽 200px |
| 动画 | 120ms | 80ms（更快，不打扰） |
| 气泡按钮 | 无（直接出现浮层） | 有（+ 按钮，50ms 后出现） |
| L1 高亮 | 无自动高亮 | 有（蓝色薄层） |

### 4.3 L2 浮层样式

```
位置：紧贴选区，显示在选区下方（如上方空间足够则显示在上方）
       避免遮挡选区文字本身
尺寸：宽 200px
背景：bg-white / dark:bg-gray-800
圆角：12px
阴影：shadow-xl
动画：从下方滑入 120ms，cubic-bezier(0.16, 1, 0.3, 1)

┌────────────────────────────────┐
│ 🤖 让 AI 解释                  │ ← 高度 36px，左侧图标 + 文字
│ 🌐 让 AI 翻译                  │
│ 💬 加入 AI 会话                │
│ 📝 新建笔记                    │
└────────────────────────────────┘
```

**边界情况**：选区在页面最右侧，浮层可能超出右边界 → 改为左对齐。

### 4.4 「让 AI 解释」流程

```
用户点击「让 AI 解释」
  ↓
浮层变为加载态：
┌────────────────────────────────┐
│ ⏳ 正在分析...                  │
└────────────────────────────────┘
  ↓
获取选区上下文（当前页文本片段 + 选区原文）
  ↓
调用 AI 解释接口
  ↓
浮层扩展为回复视图：
┌────────────────────────────────┐
│ 'self-attention' 是指：        │
│                                │
│ Self-attention 是一种让序列内   │
│ 任意位置直接建立关联的机制…     │
│ [ref:p3]                      │
│                                │
├────────────────────────────────┤
│          [💾 保存]  [关闭]     │
└────────────────────────────────┘
```

**回复视图**：
- 原文作为引用显示在顶部（灰色，12px，斜体）
- AI 回复流式输出，打字机效果（每 30ms 输出一个 token）
- 回复中如有 `[ref:pN]` 格式，自动渲染为可点击链接
- 回复完成后显示底部按钮（500ms 后才出现，避免打断）

### 4.5 「让 AI 翻译」流程

```
用户点击「让 AI 翻译」
  ↓
浮层变为左右分栏视图：
┌────────────────────────────────┐
│  原文         │  译文          │
├────────────────┬───────────────┤
│ self-attention │ self-attention│
│ is a mechanism│ 是一种机制…    │
│ ...            │ [流式输出中]   │
└────────────────┴───────────────┘
  ↓
译文流式输出
  ↓
完成后底部按钮：
[💾 保存原文+译文]  [💾 仅保存译文]  [关闭]
```

### 4.6 「加入 AI 会话」流程

```
用户点击「加入 AI 会话」
  ↓
获取选区原文
  ↓
追加到 mini AI 窗口输入框（如果 mini AI 未展开则先展开）
  ↓
选中文本自动填充到输入框，光标跳到输入框末尾
  ↓
浮层消失，用户可直接输入补充问题
  ↓
用户按 Enter 或点击发送 → 进入 AI 对话流程
```

### 4.7 「新建笔记」流程

```
用户点击「新建笔记」
  ↓
浮层关闭，L3 深度笔记编辑器展开（见第五章）
```

### 4.8 防错和错误处理

```typescript
const AI_ERROR_RESPONSES = {
  'network-error': {
    icon: '⚠️',
    message: '网络连接失败',
    action: '重试',
    duration: 5000,
  },
  'rate-limit': {
    icon: '⏳',
    message: '请求过于频繁，请稍等',
    action: null,
    duration: 8000,
  },
  'timeout': {
    icon: '⏱️',
    message: 'AI 响应超时',
    action: '重试',
    duration: 5000,
  },
  'unknown': {
    icon: '❓',
    message: '出了点问题',
    action: '重试',
    duration: 5000,
  },
};
```

**防抖**：L2 浮层出现后，300ms 内再次点击任何按钮忽略。

**浮层消失时机**：
- 用户点击浮层外部
- 10 秒无操作自动消失（可配置）
- PDF 滚动时消失
- 触发了任何 AI 请求后消失（进入加载或回复状态）

---

## 五、L3 深度笔记编辑器

### 5.0 L3 在两种模式下的行为一致

L3 编辑器在 Free Mode 和 Focus Mode 下的行为完全一致：都是覆盖在 PDF 上方的浮层，不遮挡高亮本身。

### 5.1 触发

**触发时机**：双击已有高亮块（`.l1-highlight`）。

Free Mode 和 Focus Mode 下双击高亮均触发 L3 编辑器。

**判断**：`dblclick` 事件，且 `event.target` 在高亮范围内。

```typescript
document.addEventListener('dblclick', (e) => {
  const target = e.target as HTMLElement;
  const highlight = target.closest('.l1-highlight') as HTMLElement | null;
  if (!highlight) return;

  const annotationId = highlight.dataset.annotationId;
  openNoteEditor(annotationId);
});
```

### 5.2 编辑器样式

```
位置：PDF 阅读区域上半部分浮层（不遮挡高亮本身）
尺寸：宽 100%，高 auto（最大 60vh）
背景：bg-white / dark:bg-gray-800
动画：从上方滑入 200ms

┌──────────────────────────────────────────────────────────────┐
│  第 3 页 · 来自高亮                              [×] 关闭    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ 引用原文 ─────────────────────────────────────────────┐ │
│  │ 「完全基于注意力机制，摒弃了传统的循环神经网络结构」      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  标签：[输入标签...]                                         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                         │ │
│  │  笔记正文（Markdown 格式）                              │ │
│  │                                                         │ │
│  │  支持 **加粗**、`代码`、> 引用                         │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│           [删除]                              [保存笔记]    │
└──────────────────────────────────────────────────────────────┘
```

**关键 UX**：编辑器展开时，高亮本身保持可见（用户能看到自己写的是什么）。

### 5.3 标签输入

- 输入框 placeholder：「添加标签（回车确认）」
- 自动补全已有标签（下拉列表，基于历史记录）
- 输入 `#新标签` 回车 → 创建新标签
- 已有标签以 Chip 形式显示：`[注意力机制 ×]`

### 5.4 关闭行为

- **点击保存**：保存到数据库，编辑器消失
- **点击关闭（×）**：检查是否有未保存内容
  - 有 → 弹出确认：「有未保存的笔记，确定放弃？」
  - 无 → 直接消失
- **点击高亮块外部**：等同于点击关闭

### 5.5 L3 笔记的数据结构

L3 编辑器是 PDF 上方的覆盖浮层，其 `positionX`/`positionY` 是浮层自身的屏幕坐标（用于渲染），`sourceAnchor` 中的 `textRange` 才是 PDF 上的锚点位置（用于回跳）。

```typescript
interface NoteAnnotation {
  id: string;
  documentId: string;
  type: 'note';
  text: string;          // Markdown 正文

  // 浮层屏幕坐标（用于渲染）
  positionX: number;
  positionY: number;
  pageNumber: number;

  // 来源锚点（用于回跳）
  sourceAnchor: SourceAnchor;

  // 元数据
  tags: string[];
  isPermanent: boolean;   // 永久笔记标记（用户从闪念笔记升级）
  isPinned: boolean;     // 置顶标记（升级时同步设置）
  createdAt: string;
  updatedAt: string;
}
```

---

## 六、捕获面板（Focus Mode 抽屉）

### 6.1 打开方式

- 工具条左侧 📋 按钮点击
- `Cmd+Shift+B` 快捷键（Focus Mode 内）
- 再次点击 / 点击抽屉外部 / 按 Escape → 收起

### 6.2 抽屉样式

```
位置：左侧抽屉
尺寸：宽 280px，高 100vh
背景：bg-white / dark:bg-gray-900
边框：右侧 1px border-gray-200
阴影：shadow-xl
动画：从左侧滑入 200ms

┌──────────────────────────────┐
│ 📋 捕获记录                  │
│ ──────────────────────────── │
│ [全部] [笔记] [高亮] [AI]   │  ← 筛选 Tab
│ ──────────────────────────── │
│ [✨ 一键合成]（7 条捕获）    │  ← 蓝色主按钮
├──────────────────────────────┤
│                              │
│ 2024-03-25                  │
│  ├─ 14:32                   │
│  │   └─ 📝 笔记：Self-     │
│  │   │     attention 的优势…│
│  │   └─ 🤖 AI 回复：Trans-  │
│  │         former 的并行…   │
│  └─ 14:28                   │
│      └─ 🔵 高亮：「完全基于  │
│            注意力机制」       │
│                              │
│ （时间线列表，可滚动）        │
│                              │
└──────────────────────────────┘
```

### 6.3 CaptureItem 三种样式

**笔记卡片**：
```
┌─────────────────────────────────────┐
│ 📝 我的笔记              p.3  14:32 │
│                                     │
│ Self-attention 让序列内任意位置可以  │
│ 直接建立关联，解决了 RNN 的长距离…   │
│                                     │
│ [注意力机制] [AI]       [↗ 跳转]  │
└─────────────────────────────────────┘
```

**高亮卡片**：
```
┌─────────────────────────────────────┐
│ 🔵 高亮                   p.3  14:28│
│                                     │
│ 「完全基于注意力机制，摒弃了传统…   │
│                                     │
│                     [↗ 跳转] [📝] │
└─────────────────────────────────────┘
```

**AI 回复卡片**：
```
┌─────────────────────────────────────┐
│ 🤖 AI 解释                 p.3  14:30│
│                                     │
│ Self-attention 的核心是 Query、     │
│ Key、Value 的线性投影…              │
│                                     │
│ [ref:p3] [ref:p5]     [↗ 跳转]   │
│                        [💾 已保存 ✓]│
└─────────────────────────────────────┘
```

### 6.4 交互行为

- **点击卡片主体** → 跳转到 PDF 对应页 + 高亮位置（3 秒可见后淡出）
- **点击跳转按钮（↗）** → 同上（明确触发）
- **点击标签 Chip** → 筛选同标签的所有捕获（同时更新 Tab 为「全部」）
- **长按 / 右键卡片** → 操作菜单：复制 / 编辑并升级 / 删除
- **向下滚动** → 加载更早的捕获（分页，20 条/页）
- **捕获为空时** → 空状态：「还没有任何捕获。Focus Mode 下选中文本即可开始。」

### 6.5 时间线分组逻辑

```
显示规则：
1. 按日期一级分组（2024-03-25 / 2024-03-24）
2. 日期内按时间二级分组（14:32 / 14:28）
3. 同时间的多个捕获并列显示
4. 每个日期最多显示 3 个时间分组
5. 超出时显示「还有 N 条，点击加载更多」
```

### 6.6 一键合成按钮

- **前置条件**：至少 3 条捕获
- **不足 3 条时**：按钮灰色禁用，hover 显示「需要至少 3 条捕获」
- **满足条件时**：显示「基于 7 条捕获」（蓝色主按钮）
- **点击后**：按钮变为「AI 合成中… ⏳」，AI Panel 展开，流程见第七章

### 6.7 闪念笔记升级为永久笔记

**触发**：长按 / 右键笔记卡片 → 选择「编辑并升级」

**行为**：
1. 打开 L3 深度笔记编辑器（预填现有内容）
2. 用户修改正文、调整标签
3. 保存时，设置 `isPermanent: true` + `isPinned: true`
4. 笔记移动到捕获面板「永久笔记」分组（或标记 pinned）

---

## 七、mini AI 窗口

### 7.1 打开方式

- 点击右下角悬浮按钮 🤖
- `Cmd+`` 快捷键（Focus Mode 内）
- 再次点击按钮 / 点击关闭 / 按 Escape → 收起

### 7.2 窗口样式

```
位置：固定右下角，距右侧 16px，距底部 80px
尺寸：宽 320px，高 480px（视口 60%）
背景：bg-white / dark:bg-gray-900
圆角：12px
阴影：shadow-2xl
动画：从右侧滑入 200ms

┌──────────────────────────────────┐
│ 🤖 AI 助手              [─] [×] │  ← 标题栏
├──────────────────────────────────┤
│                                  │
│ [User] self-attention 是什么？  │
│                                  │
│ [AI] Self-attention 是一种让序列 │
│ 内任意位置直接建立关联的机制。    │
│ 在 Transformer 中，每个位置都会    │
│ 计算对所有其他位置的注意力…       │
│ [ref:p3] [ref:p5]               │
│                                  │
│ （消息列表，可滚动）              │
│                                  │
├──────────────────────────────────┤
│ [📎 原文] [💾 保存]              │  ← 快捷操作栏
│ ┌────────────────────────────┐   │
│ │ 输入问题...                │   │  ← 输入框
│ └────────────────────────────┘   │
│                     [发送 ↗]    │
└──────────────────────────────────┘
```

**窄屏适配**：屏幕宽度 < 900px 时，改为底部抽屉模式（宽 100%，高 50vh）。

### 7.3 消息气泡样式

**User 消息**：
```
┌──────────────────────────┐
│ self-attention 是什么？  │ ← 靠右
└──────────────────────────┘
  bg-blue-500，白色文字，圆角 12px
```

**AI 消息**：
```
┌──────────────────────────┐
│ Self-attention 是一种让… │ ← 靠左
│ [ref:p3]                │
└──────────────────────────┘
  bg-gray-100 / dark:bg-gray-800，主题色文字
```

**引用链接**：`[ref:p3]` 显示为蓝色可点击文字，点击后跳转到 p.3 并高亮引用文字。

### 7.4 快捷操作栏

**[📎 原文]**：
点击后展开当前页文本片段浮层（最大高度 120px，可滚动），用户可选中片段作为后续对话的上下文：

```
┌──────────────────────────────────┐
│ 当前页文本（点击选中片段作为上下文）│
├──────────────────────────────────┤
│ Attention mechanism is a crucial │
│ concept in modern deep learning. │
│ The self-attention mechanism    │ ← 用户可选中
│ allows direct correlation between │
│ any two positions in a sequence. │
└──────────────────────────────────┘
```

**[💾 保存]**：
将当前对话追加到捕获面板（作为 `ai-response` capture）。如已有保存，显示「已保存 ✓」。

### 7.5 上下文传递

mini AI 窗口的上下文优先级：
1. 用户选中的文本片段（最优先）
2. 📎 原文选中的片段
3. 当前页全文（兜底）
4. 如果以上都没有 → 不传递上下文，让用户自由提问

### 7.6 错误和加载状态

```
AI 思考中：
┌──────────────────────────────────┐
│ ⏳ AI 正在思考...                │ ← 流式显示
│ ▊                              │
└──────────────────────────────────┘

错误：
┌──────────────────────────────────┐
│ ⚠️ 网络连接失败            [重试] │
└──────────────────────────────────┘
```

---

## 八、阅读进度与摘要触发

### 8.1 像素进度法

```typescript
function calculatePixelProgress(): number {
  const container = scrollContainerRef.current;
  if (!container) return 0;

  const totalHeight = container.scrollHeight;
  const viewportHeight = container.clientHeight;
  const currentScroll = container.scrollTop;

  const maxScroll = totalHeight - viewportHeight;
  if (maxScroll <= 0) return 0;

  return Math.min(100, (currentScroll / maxScroll) * 100);
}
```

### 8.2 进度更新策略

```typescript
let rafId: number | null = null;
let lastSaveTime = 0;
const maxProgressRef = { current: 0 };

function onScroll() {
  if (rafId) cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(() => {
    const progress = calculatePixelProgress();

    // 更新最大值（记录最远读过的地方，用于判断 80%）
    if (progress > maxProgressRef.current) {
      maxProgressRef.current = progress;
    }

    // 持久化（debounce 1s）
    if (Date.now() - lastSaveTime > 1000) {
      saveProgressDebounced();
      lastSaveTime = Date.now();
    }

    // 检查摘要触发（每 5s 最多检查一次）
    checkSummaryTrigger();
  });
}

// 防抖保存进度到 FocusSession
const saveProgressDebounced = debounce(async (sessionId: string, page: number, scrollTop: number, progress: number) => {
  await focusCommands.updateSession(sessionId, {
    last_page: page,
    max_scroll_top: scrollTop,
    max_read_percentage: maxProgressRef.current,
  });
}, 1000);

// 检查是否触发 80% 摘要提示
let lastSummaryCheckTime = 0;
function checkSummaryTrigger() {
  if (Date.now() - lastSummaryCheckTime < 5000) return; // 每 5s 最多检查一次
  lastSummaryCheckTime = Date.now();

  const progress = maxProgressRef.current;
  const captureCount = highlights.length + notes.length;
  const triggerKey = `summary_prompted_${documentId}`;
  if (localStorage.getItem(triggerKey)) return;

  if (progress >= 80 && captureCount >= 3) {
    localStorage.setItem(triggerKey, new Date().toISOString());
    showReadingSummaryPrompt();
  }
}
```

### 8.3 80% 摘要提示

**触发条件**：
- `maxProgressRef.current >= 80`（像素法）
- 捕获数量 >= 3
- 同一文档首次触发（`localStorage` 中无标记）

**显示时机**：满足条件后，下次滚动事件触发时显示。

**提示样式**（右下角浮卡）：

```
┌──────────────────────────────────────────────┐
│ 📖 阅读完成！你积累了 7 条标注                │
│                                               │
│  是否生成阅读摘要？                           │
│                                               │
│  [生成摘要]      [稍后]      [不需要]       │
└──────────────────────────────────────────────┘

位置：距右侧 16px，距底部 100px
尺寸：宽 300px
背景：bg-white / dark:bg-gray-800
动画：从下方滑入 150ms
```

**用户选择**：

| 选择 | 行为 |
|------|------|
| 生成摘要 | AI Panel 展开，流式输出摘要，追加到捕获面板 |
| 稍后 | 关闭，3 小时后或下次打开同一文档再次提示 |
| 不需要 | 关闭，今天不再提示（`localStorage` 标记当天） |

### 8.4 AI 摘要内容

```typescript
// 调用 AI 时的输入
const summaryPrompt = `
文档：《${documentTitle}》
阅读时间：${readAt}
总标注数：${captureCount} 条

捕获内容：
${captures.map(c => `[${c.type} - p.${c.pageNumber}] ${c.text}`).join('\n')}

请生成一份阅读摘要，要求：
1. 提炼 3-5 个核心观点，每条注明来源页码 [p.X]
2. 识别你标注最多的主题
3. 如发现与已有知识库相关，提示关联
4. Markdown 格式输出
`;
```

---

## 九、一键合成流程

### 9.1 合成状态机

```
[初始] → [点击合成] → [AI 生成中] → [生成完成] → [编辑] → [发布]
                              ↓                    ↓
                          [失败]              [放弃/取消]
```

### 9.2 各状态 UI

**初始态**：`[✨ 一键合成]（7 条捕获）` 蓝色按钮

**AI 生成中**：
- 按钮：`[⏳ AI 合成中…]`（禁用态）
- mini AI 窗口展开，流式显示 AI 输出
- 捕获面板显示：「正在基于 7 条捕获生成摘要…」（不可交互）

**生成完成**：
- 捕获面板顶部出现合成结果卡片（带「✨ 已合成」标签）
- 按钮变为：`[📝 编辑]` 和 `[✓ 发布]` 两个按钮

**用户编辑**：
- 点击「编辑」→ Markdown 进入可编辑态
- 简易编辑器工具栏：加粗 / 链接 / 引用 / 预览切换

**发布**：
- 点击「发布」→ 合成笔记存入数据库（type: `synthesized-note`）
- 自动分配标签：来源文档名 + 日期
- Toast：「笔记已保存到知识库」
- 合成卡片移至捕获面板顶部，带 `✨ 已合成` 标签

**失败**：`[⚠️ 合成失败，请重试]` 红色提示

---

## 十、Focus Session 状态管理

### 10.1 FocusModeState

```typescript
interface FocusModeState {
  isActive: boolean;
  currentSessionId: string | null;
  isRestoring: boolean;
  resumePromptVisible: boolean;
  resumeSession: FocusExitState | null;
  miniAIWindowOpen: boolean;
  captureDrawerOpen: boolean;
  maxProgress: number;          // 像素法进度最大值
  highlightsCount: number;
  notesCount: number;
  aiResponsesCount: number;
}
```

### 10.2 分层 Escape 处理

```
Escape 键按下
  ↓
检查 mini AI 窗口是否打开
  → 是：关闭 mini AI 窗口，停止（不退出 Focus Mode）
  ↓ 否
检查捕获抽屉是否打开
  → 是：关闭捕获抽屉，停止（不退出 Focus Mode）
  ↓ 否
检查 L2/L3 浮层是否打开
  → 是：关闭浮层，停止
  ↓ 否
退出 Focus Mode（回到 Free Mode）
```

### 10.3 Focus Mode 中的 PDF 交互拦截

Focus Mode 激活期间，拦截以下行为：

| 行为 | 处理 |
|------|------|
| 快速滚动时鼠标松开 | 忽略选区事件（防止误触发高亮） |
| 页面切换 | 正常允许 |
| 双击高亮 | 正常触发 L3 编辑器 |
| 右键 | 显示 L2 菜单（不显示浏览器默认菜单） |

---

## 十一、快捷键总表

### 11.1 全局快捷键

| 快捷键 | 模式 | 功能 |
|--------|------|------|
| `Cmd+Shift+F` | 全局 | 切换 Focus Mode |
| `Escape` | Focus Mode | 分层处理（见 10.2） |
| `Escape` | Free Mode | 无操作（或关闭当前浮层） |
| `Cmd+Shift+B` | Focus Mode | 展开/收起捕获抽屉 |
| `Cmd+\`` | Focus Mode | 展开/收起 mini AI 窗口 |
| `Cmd+G` | 全局 | 跳转页码 |

### 11.2 L2 浮层内快捷键

| 快捷键 | 功能 |
|--------|------|
| `1` | 选择「让 AI 解释」|
| `2` | 选择「让 AI 翻译」|
| `3` | 选择「加入 AI 会话」|
| `4` | 选择「新建笔记」|
| `Escape` | 关闭浮层 |

### 11.3 mini AI 窗口内快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息（输入框聚焦时）|
| `Shift+Enter` | 换行 |
| `Escape` | 关闭 mini AI 窗口（不退出 Focus Mode）|

---

## 十二、数据模型

### 12.1 SQL Schema

```sql
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  entered_at TEXT NOT NULL,
  exited_at TEXT,
  duration_minutes INTEGER,

  last_page INTEGER NOT NULL DEFAULT 1,
  max_scroll_top REAL NOT NULL DEFAULT 0,
  max_read_percentage REAL NOT NULL DEFAULT 0,

  ai_panel_collapsed INTEGER NOT NULL DEFAULT 1,
  ai_conversation_id TEXT,

  highlights_count INTEGER NOT NULL DEFAULT 0,
  notes_count INTEGER NOT NULL DEFAULT 0,
  ai_responses_count INTEGER NOT NULL DEFAULT 0,

  summary_triggered INTEGER NOT NULL DEFAULT 0,
  summary_action TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX idx_focus_sessions_doc_time
  ON focus_sessions(document_id, exited_at DESC);
```

### 12.2 TypeScript 类型

```typescript
interface FocusSession {
  id: string;
  documentId: string;
  sessionId: string;
  enteredAt: string;
  exitedAt?: string;
  durationMinutes?: number;

  lastPage: number;
  maxScrollTop: number;
  maxReadPercentage: number;

  aiPanelCollapsed: boolean;
  aiConversationId?: string;

  highlightsCount: number;
  notesCount: number;
  aiResponsesCount: number;

  summaryTriggered: boolean;
  summaryAction?: 'generated' | 'later' | 'dismissed';

  createdAt: string;
  updatedAt: string;
}

interface FocusExitState {
  documentId: string;
  sessionId: string;
  lastPage: number;
  maxScrollTop: number;
  readPercentage: number;
  sessionDurationMinutes: number;
  exitedAt: string;
  aiPanelCollapsed: boolean;
  aiConversationId?: string;
}

interface SourceAnchor {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  textRange: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  originalText: string;
  // 来源：创建该锚点时，当前激活的 FocusSession.id
  // 同一会话内所有捕获共享同一个 readingSessionId，方便按会话聚合
  readingSessionId: string;
  readAt: string;
}
```

---

## 十三、Tauri 命令

```rust
// src-tauri/src/commands/focus.rs

#[tauri::command]
async fn create_focus_session(
    app: AppHandle,
    document_id: String,
    session_id: String,
    entered_at: String,
    last_page: i32,
) -> Result<FocusSession, String>;

#[tauri::command]
async fn update_focus_session(
    app: AppHandle,
    session_id: String,
    updates: FocusSessionUpdate,
) -> Result<(), String>;

#[tauri::command]
async fn get_last_focus_session(
    app: AppHandle,
    document_id: String,
) -> Result<Option<FocusSession>, String>;

#[tauri::command]
async fn get_focus_session_history(
    app: AppHandle,
    document_id: String,
    limit: i32,
) -> Result<Vec<FocusSession>, String>;
```

---

## 十四、Settings 字段

```typescript
interface FocusSettings {
  showResumePrompt: boolean;              // 默认 true
  autoEnterFocusOnDocOpen: boolean;       // 默认 false
  focusModeAiPanelPosition: 'right' | 'bottom'; // 默认 'right'
}

interface CaptureSettings {
  autoSaveAIResponses: boolean;            // 默认 true
}

interface Settings {
  focus: FocusSettings;
  capture: CaptureSettings;
  // ... 已有字段
}
```

---

## 十五、组件清单

### 15.1 新建组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `FocusModeProvider` | `components/focus/FocusModeProvider.tsx` | 上下文 Provider，管理所有 Focus Mode 状态 |
| `FocusModeToggle` | `components/focus/FocusModeToggle.tsx` | 工具条切换按钮 |
| `FocusModeToolbar` | `components/focus/FocusModeToolbar.tsx` | Focus Mode 极简工具条 |
| `FocusFAB` | `components/focus/FocusFAB.tsx` | 右下角 AI 悬浮按钮 + 徽章 |
| `MiniAIWindow` | `components/focus/MiniAIWindow.tsx` | mini AI 交互窗口 |
| `CaptureDrawer` | `components/capture/CaptureDrawer.tsx` | 捕获记录抽屉 |
| `CaptureItem` | `components/capture/CaptureItem.tsx` | 单条捕获卡片（支持三种类型）|
| `TimelineGroup` | `components/capture/TimelineGroup.tsx` | 日期 + 时间分组 |
| `ResumePrompt` | `components/focus/ResumePrompt.tsx` | 恢复提示卡片 |
| `FocusStatusBar` | `components/focus/FocusStatusBar.tsx` | 底部状态栏 |
| `L1HighlightBubble` | `components/capture/L1HighlightBubble.tsx` | 选中文本气泡按钮 |
| `L2AIPopover` | `components/capture/L2AIPopover.tsx` | L2 AI 即时交互浮层 |
| `L3NoteEditor` | `components/capture/L3NoteEditor.tsx` | 深度笔记编辑器 |
| `ReadingSummaryPrompt` | `components/capture/ReadingSummaryPrompt.tsx` | 80% 摘要提示卡片 |
| `FirstUseTooltip` | `components/focus/FirstUseTooltip.tsx` | 首次使用 Tooltip |
| `AISummaryCard` | `components/capture/AISummaryCard.tsx` | 合成笔记结果卡片 |

### 15.2 修改组件

| 组件 | 修改内容 |
|------|----------|
| `App.tsx` | 引入 FocusModeProvider，整合状态 |
| `Sidebar.tsx` | 响应 `sidebar: 'hidden'` |
| `AIPanel.tsx` | 响应 `aiPanel: 'mini'` |
| `Toolbar.tsx` | 根据 Mode 切换按钮配置 |
| `PDFViewer` | L1 高亮层渲染、选区检测 |
| `useKeyboardShortcuts` | 新增 Focus Mode 快捷键 |
| `useSettings` | 新增 Settings 字段 |

---

## 十六、边界情况

| 情况 | 处理 |
|------|------|
| Focus Mode 中文档被删除 | 自动退出，显示「文档不存在」提示 |
| Focus Mode 中 AI 服务不可用 | 悬浮按钮变灰色，hover 显示离线状态 |
| 恢复提示时，会话超过 7 天 | 不显示提示 |
| Focus Mode 中关闭 App | `beforeunload` 保存 FocusSession |
| 恢复会话时 scrollTop 超出高度 | clamp 到 `maxScrollTop` |
| L2 请求进行中时滚动 | 等待请求完成，浮层保持 |
| 大量捕获（100+ 条） | 分页加载（20 条/页），每页独立请求 |
| 跨页选区 | 只处理当前页部分，气泡提示「跨页选区已截断」 |

---

## 十七、实现顺序

### Phase 1：Focus Mode 基础切换

1. FocusModeProvider 状态管理
2. 侧边栏折叠和 AI Panel 收缩
3. `Cmd+Shift+F` 快捷键
4. 进入/退出动画
5. FocusSession 数据库写入（仅保存，不恢复）

### Phase 2：捕获链路（L1 → L2 → L3）

6. L1 自动高亮（选区检测 + 渲染 + 防抖）
7. L1 气泡按钮
8. L2 AI 浮层（四种操作入口）
9. L2 「解释」和「翻译」流程
10. L2 「加入会话」和「新建笔记」
11. L3 深度笔记编辑器

### Phase 3：面板和进度

12. mini AI 窗口（右侧抽屉）
13. 捕获记录抽屉（时间线分组）
14. 捕获面板 CaptureItem（三种类型）
15. 一键合成按钮 + 合成状态机
16. 像素进度检测
17. 80% 摘要提示 + AI 摘要生成

### Phase 4：恢复和细节

18. 恢复提示 UI + 判断逻辑
19. 页码 + scrollTop + AI 会话恢复
20. Focus Session 历史记录
21. 首次使用 Tooltip
22. Settings 字段接入
23. 动画性能优化（GPU 加速、`will-change`）
24. 快捷键完善
