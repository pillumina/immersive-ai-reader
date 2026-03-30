# Pretext 集成详设文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 项目名称 | Pretext 集成优化 |
| 版本 | v1.0 |
| 创建日期 | 2026-03-30 |
| 状态 | 待评审 |
| 关联 | `docs/ROADMAP_PROGRESS.md` |

---

## 1. 背景与目标

### 1.1 当前痛点

| 问题 | 描述 | 影响 |
|------|------|------|
| 文本层 DOM 爆炸 | pdfjs 为每个字符创建 `<span>`，100 页论文可达 10 万+ DOM 节点 | 滚动卡顿、内存占用高 |
| 高亮选区不精确 | 依赖 `range.getClientRects()` 返回的矩形，双栏/复杂布局不准 | 跨列高亮、矩形碎片化 |
| 缩放时重排成本高 | 每次缩放文本层重新布局，触发大量 reflow | 缩放操作不流畅 |
| 虚拟滚动文本层未回收 | 当前虚拟滚动只回收 Canvas，文本层 DOM 常驻 | 大文档内存压力 |

### 1.2 Pretext 简介

[`@chenglou/pretext`](https://github.com/chenglou/pretext) 是一个 15KB、零依赖的纯 JS 文本测量与排版库：

- **核心能力**：不触发 DOM layout reflow 就能精确测量和排版多行文本
- **两阶段模型**：`prepare(text, font)` 一次性测量 + `layout(prepared, width, lineHeight)` 纯算术排版
- **性能**：500 个文本块排版 ~0.09ms（DOM 方式 ~43ms）
- **API**：`prepareWithSegments()` + `layoutNextLine()` + `walkLineRanges()` 提供逐行游标输出

### 1.3 集成目标

1. **精确高亮**：基于 Pretext 的行级排版数据计算高亮矩形，替代 `getClientRects()`
2. **轻量文本层**：用 Canvas 渲染文本层，减少 90%+ DOM 节点
3. **双栏精确选区**：利用 Pretext 的列感知排版解决跨列高亮问题
4. **虚拟化文本渲染**：只渲染可视区域的文本行，支持百页文档流畅滚动

---

## 2. 整体架构

### 2.1 当前架构

```
PDF 文件
  → pdfjs-dist 解析
    → page.render() → Canvas 像素渲染（pdf-page 内）
    → page.getTextContent() → TextLayerBuilder → N 个 <span>（pdf-text-layer 内）
    → 用户选中文本 → range.getClientRects() → 高亮矩形
```

### 2.2 目标架构

```
PDF 文件
  → pdfjs-dist 解析
    → page.render() → Canvas 像素渲染（不变）
    → page.getTextContent() → PretextTextLayer（新模块）
        → prepareWithSegments() 缓存行数据
        → Canvas 文本渲染（替代 DOM span）
        → 提供 queryLineAtPoint(x, y) 用于选区→行映射
    → 用户选中文本 → 行数据查询 → 精确高亮矩形（无需 getClientRects）
```

### 2.3 模块划分

```
src/lib/pdf/
  pretext-text-layer.ts    ← 新增：Pretext 文本层核心
  pretext-line-cache.ts    ← 新增：行数据缓存
  pretext-hit-test.ts      ← 新增：坐标→文本映射
  renderer.ts              ← 修改：接入 PretextTextLayer

src/hooks/
  useCanvasRendering.ts    ← 修改：高亮逻辑使用行数据
  usePretextTextLayer.ts   ← 新增：文本层生命周期 hook

src/components/layout/
  MainCanvas.tsx           ← 修改：选区检测使用行数据
```

---

## 3. 分阶段实施计划

### Phase 1：精确高亮矩形（低风险，高价值）

**目标**：用 Pretext 的行数据替代 `getClientRects()` 计算高亮矩形，解决双栏跨列问题。

#### 3.1.1 新增 `src/lib/pdf/pretext-text-layer.ts`

```typescript
import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments } from '@chenglou/pretext';

/** PDF 页面中一行的排版数据 */
export interface PretextLineData {
  /** 行文本内容 */
  text: string;
  /** 行在页面内的 Y 坐标（px，相对于 page viewport） */
  top: number;
  /** 行高（px） */
  height: number;
  /** 行内每个段的 X 起始位置和宽度 */
  segments: Array<{ text: string; left: number; width: number }>;
}

/** 单页的 Pretext 排版结果 */
export interface PretextPageLayout {
  pageNumber: number;
  lines: PretextLineData[];
  /** 整体文本（用于全文搜索） */
  fullText: string;
}

/**
 * 从 pdfjs TextContent 构建 Pretext 排版数据。
 *
 * pdfjs TextContent.items 是一组 TextItem：
 *   { str, dir, width, height, transform: [scaleX, skewX, skewY, scaleY, x, y], fontName, hasEOL }
 *
 * 策略：将同一行的 items 合并为完整行文本，用 Pretext 的 prepare+layout
 * 得到精确的段级宽度，再映射回 PDF 坐标系。
 */
export function buildPageLayout(
  textContent: { items: TextItem[] },
  viewport: { width: number; height: number; scale: number },
  fontStack: string, // 从 CSS 计算得到，如 '12px "Newsreader", serif'
): PretextPageLayout {
  // 1. 按 Y 坐标聚合为行
  const lineItems = groupItemsByLine(textContent.items);

  // 2. 对每行执行 Pretext prepare + layout
  const lines: PretextLineData[] = [];
  for (const { items, y, fontSize } of lineItems) {
    const lineText = items.map(i => i.str).join('');
    if (!lineText.trim()) continue;

    const font = `${fontSize}px ${fontStack}`;
    const prepared = prepareWithSegments(lineText, font);
    const layout = layoutWithLines(prepared, viewport.width, fontSize * 1.2);

    const segments = layout.lines.map(line => ({
      text: line.text,
      left: line.left,
      width: line.width,
    }));

    lines.push({
      text: lineText,
      top: y,
      height: fontSize * 1.2,
      segments,
    });
  }

  return {
    pageNumber: 0, // 由调用者填入
    lines,
    fullText: lines.map(l => l.text).join('\n'),
  };
}
```

#### 3.1.2 新增 `src/lib/pdf/pretext-hit-test.ts`

```typescript
import type { PretextPageLayout, PretextLineData } from './pretext-text-layer';

/** 点命中测试结果 */
export interface HitTestResult {
  lineIndex: number;
  line: PretextLineData;
  segmentIndex: number;
  charOffset: number;
  /** 命中的字符在行文本中的起始位置 */
  textOffset: number;
}

/**
 * 给定页面坐标 (x, y)，找到对应的行和字符位置。
 * 用于文本选区 → 精确高亮矩形的映射。
 */
export function hitTestLine(
  layout: PretextPageLayout,
  x: number,
  y: number,
): HitTestResult | null {
  // 1. 找到 y 对应的行
  const lineIdx = layout.lines.findIndex(
    l => y >= l.top && y < l.top + l.height
  );
  if (lineIdx < 0) return null;

  const line = layout.lines[lineIdx];

  // 2. 找到 x 对应的段
  let segIdx = line.segments.findIndex(
    s => x >= s.left && x < s.left + s.width
  );
  if (segIdx < 0) {
    // 容差：取最近的段
    segIdx = findNearestSegment(line.segments, x);
    if (segIdx < 0) return null;
  }

  const seg = line.segments[segIdx];
  const charWidth = seg.width / Math.max(seg.text.length, 1);
  const charOffset = Math.floor((x - seg.left) / charWidth);

  // 计算 textOffset（前面所有段的字符数 + 当前段偏移）
  let textOffset = 0;
  for (let i = 0; i < segIdx; i++) {
    textOffset += line.segments[i].text.length;
  }
  textOffset += Math.min(charOffset, seg.text.length);

  return { lineIndex: lineIdx, line, segmentIndex: segIdx, charOffset, textOffset };
}

/**
 * 给定选区的起止坐标，返回需要高亮的矩形列表。
 * 这是替代 range.getClientRects() 的核心函数。
 */
export function getHighlightRects(
  layout: PretextPageLayout,
  startY: number,
  startX: number,
  endY: number,
  endX: number,
): Array<{ left: number; top: number; width: number; height: number }> {
  // 确保 start < end
  if (startY > endY || (startY === endY && startX > endX)) {
    [startX, endX] = [endX, startX];
    [startY, endY] = [endY, startY];
  }

  const rects: Array<{ left: number; top: number; width: number; height: number }> = [];

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];

    // 跳过不在选区范围内的行
    if (line.top + line.height < startY || line.top > endY) continue;

    let left: number;
    let right: number;

    if (line.top < startY || (line.top === startY && i === 0)) {
      // 第一行：从 startX 开始
      const seg = findSegmentAtX(line, startX);
      left = seg ? Math.max(seg.left, startX) : line.segments[0]?.left ?? 0;
    } else {
      left = line.segments[0]?.left ?? 0;
    }

    if (line.top + line.height > endY || (line.top + line.height === endY && i === layout.lines.length - 1)) {
      // 最后一行：到 endX 结束
      const seg = findSegmentAtX(line, endX);
      right = seg ? Math.min(seg.left + seg.width, endX) : line.segments[line.segments.length - 1]?.left + (line.segments[line.segments.length - 1]?.width ?? 0) ?? 0;
    } else {
      const lastSeg = line.segments[line.segments.length - 1];
      right = lastSeg ? lastSeg.left + lastSeg.width : 0;
    }

    if (right > left) {
      rects.push({ left, top: line.top, width: right - left, height: line.height });
    }
  }

  return rects;
}
```

#### 3.1.3 修改 `useCanvasRendering.ts` — highlightSelection

```typescript
// 修改前：依赖 range.getClientRects()
const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);

// 修改后：使用 Pretext 行数据计算精确矩形
const pageLayout = pretextCache.getPageLayout(pageNumber);
if (pageLayout) {
  const startHit = hitTestLine(pageLayout, startX_page, startY_page);
  const endHit = hitTestLine(pageLayout, endX_page, endY_page);
  if (startHit && endHit) {
    rects = getHighlightRects(pageLayout, startY_page, startX_page, endY_page, endX_page);
  }
}
```

#### 3.1.4 交付物

| 文件 | 变更 |
|------|------|
| `src/lib/pdf/pretext-text-layer.ts` | 新增 |
| `src/lib/pdf/pretext-hit-test.ts` | 新增 |
| `src/lib/pdf/pretext-line-cache.ts` | 新增（LRU 缓存，最大 50 页） |
| `src/lib/pdf/renderer.ts` | 修改 `renderSinglePage`：渲染后调用 `buildPageLayout` 缓存 |
| `src/hooks/useCanvasRendering.ts` | 修改 `highlightSelection`：优先使用 Pretext 行数据 |

---

### Phase 2：Canvas 文本层（中等风险，高收益）

**目标**：用 Canvas 渲染透明文本层，替代 pdfjs 默认的 DOM `<span>` 文本层。

#### 3.2.1 设计要点

```
┌──────────────────────────────────────────┐
│ .pdf-page                                │
│  ┌────────────────────────────────────┐  │
│  │ <canvas> PDF 像素渲染（已有）       │  │
│  ├────────────────────────────────────┤  │
│  │ <canvas> pretext-text-canvas（新）  │  │
│  │   - 透明背景                        │  │
│  │   - 用 Pretext 行数据渲染透明文字   │  │
│  │   - 仅渲染可视区域（虚拟化）        │  │
│  │   - 支持文本选择（pointer events）  │  │
│  ├────────────────────────────────────┤  │
│  │ <div> 高亮/标注层（已有）           │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

#### 3.2.2 新增 `src/lib/pdf/pretext-text-renderer.ts`

```typescript
/**
 * 用 Canvas 渲染透明文本层。
 *
 * 与 pdfjs 默认 TextLayer 的区别：
 * 1. 零 DOM 节点（仅一个 canvas）
 * 2. 文本位置来自 Pretext 排版数据，精确匹配 PDF 渲染
 * 3. 仅渲染可视区域的行（虚拟化）
 * 4. 支持 CSS 文本选择（通过隐藏文本 div + 透明 canvas 叠加）
 */
export class PretextTextRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layout: PretextPageLayout;
  private dpr: number;

  constructor(pageEl: HTMLElement, layout: PretextPageLayout) {
    this.layout = layout;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pretext-text-canvas';
    // 设置尺寸...
    pageEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** 渲染可视区域内的文本行 */
  renderVisibleLines(viewportTop: number, viewportHeight: number): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = this.font;
    this.ctx.fillStyle = 'transparent'; // 透明文字（仅用于命中测试）

    for (const line of this.layout.lines) {
      if (line.top + line.height < viewportTop) continue;
      if (line.top > viewportTop + viewportHeight) break;

      for (const seg of line.segments) {
        this.ctx.fillText(seg.text, seg.left, line.top + line.height * 0.8);
      }
    }
  }

  destroy(): void {
    this.canvas.remove();
  }
}
```

#### 3.2.3 文本选择策略

Canvas 文本不可被浏览器原生选择。解决方案：

**方案 A：隐藏文本 div（推荐）**
- 保留一个极简的隐藏 `<div>`，包含每行的 `<span>`，但设置 `opacity: 0`、`pointer-events: none`
- 用户选择文本时，实际选择的是隐藏 div 中的文字
- 高亮矩形从 Pretext 行数据计算，不依赖 `getClientRects()`
- 优点：浏览器原生选择体验；缺点：仍有少量 DOM 节点

**方案 B：自绘选择框**
- 完全在 Canvas 上实现文本选择（mousedown → hit test → 拖拽 → 反色渲染）
- 优点：零 DOM；缺点：失去浏览器原生选择体验（复制、右键菜单等），工作量大

**推荐方案 A**：隐藏文本 div 只包含每行一个 `<span>`（而非每字符），节点数从万级降到百级。

#### 3.2.4 交付物

| 文件 | 变更 |
|------|------|
| `src/lib/pdf/pretext-text-renderer.ts` | 新增 |
| `src/lib/pdf/renderer.ts` | 修改：`renderSinglePage` 使用 `PretextTextRenderer` 替代 pdfjs TextLayer |
| `src/hooks/useCanvasRendering.ts` | 修改：虚拟化文本渲染（IntersectionObserver 触发 renderVisibleLines） |

---

### Phase 3：虚拟化文本层（中等风险，性能收益）

**目标**：配合虚拟滚动，只渲染可视页面的文本层，离屏页面回收。

#### 3.3.1 设计

```typescript
// src/hooks/usePretextTextLayer.ts
export function usePretextTextLayer(
  containerId: string,
  pageLayouts: Map<number, PretextPageLayout>,
) {
  const renderers = useRef<Map<number, PretextTextRenderer>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page-number'));
          if (entry.isIntersecting) {
            // 页面进入视口：创建/显示文本渲染器
            if (!renderers.current.has(pageNum)) {
              const layout = pageLayouts.get(pageNum);
              if (layout) {
                renderers.current.set(pageNum, new PretextTextRenderer(
                  entry.target as HTMLElement, layout
                ));
              }
            }
          } else {
            // 页面离开视口：回收文本渲染器
            renderers.current.get(pageNum)?.destroy();
            renderers.current.delete(pageNum);
          }
        }
      },
      { rootMargin: '200px' } // 预加载上下 200px
    );

    // 观察所有 .pdf-page 元素
    const container = document.getElementById(containerId);
    container?.querySelectorAll('.pdf-page').forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [containerId, pageLayouts]);
}
```

#### 3.3.2 内存管理

- `PretextPageLayout` 缓存使用 LRU 策略，最多缓存 50 页（约 5MB）
- 离屏页面的 `PreparedText` 句柄释放（Pretext 缓存自动管理）
- `PretextTextRenderer` 在页面离开视口时销毁 Canvas

---

### Phase 4：双栏精确选区（基于 Phase 1 的行数据）

**目标**：利用 Pretext 行数据中的 X 坐标信息，精确区分双栏论文的左列和右列。

#### 3.4.1 列检测算法

```typescript
/**
 * 从行数据中检测多列布局。
 *
 * 策略：统计所有行的段起始 X 坐标分布，
 * 如果出现明显的双峰分布（两簇 X 值），则判定为双栏。
 */
export function detectColumns(layout: PretextPageLayout): ColumnInfo {
  const startPositions = layout.lines
    .flatMap(l => l.segments.map(s => s.left))
    .filter(x => x > 0);

  // K-means 或直方图分箱检测双峰
  // 简化版：找出出现频率最高的两个 X 起始位置
  const buckets = binPositions(startPositions, 5); // 5px 容差
  const peaks = buckets
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map(b => b.center);

  if (peaks.length < 2 || Math.abs(peaks[0] - peaks[1]) < 100) {
    return { isMultiColumn: false, columns: [] };
  }

  const boundary = (peaks[0] + peaks[1]) / 2;
  return {
    isMultiColumn: true,
    columns: [
      { index: 0, left: 0, right: boundary },
      { index: 1, left: boundary, right: Infinity },
    ],
    boundary,
  };
}

export interface ColumnInfo {
  isMultiColumn: boolean;
  columns: Array<{ index: number; left: number; right: number }>;
  boundary?: number;
}
```

#### 3.4.2 列感知高亮

```typescript
// 用户从第 1 行左列拖到第 3 行左列
// startHit.lineIndex=0, startHit.segmentIndex=0（左列段）
// endHit.lineIndex=2, endHit.segmentIndex=0（左列段）
// → getHighlightRects 只返回左列的矩形
```

---

## 4. 性能预期

| 指标 | 当前 | Phase 1 后 | Phase 2-3 后 |
|------|------|-----------|-------------|
| DOM 节点数（100 页论文） | ~100,000 | ~100,000（不变） | ~2,000（每行 1 span） |
| 高亮精度 | 依赖 getClientRects | 行级精确 | 行级精确 |
| 双栏跨列 | 无法处理 | 列感知检测 | 列感知检测 |
| 缩放时文本层重排 | 全量 reflow | 不变 | Canvas 重绘（~1ms） |
| 离屏页面内存 | 常驻 | 常驻 | 回收（LRU 50 页） |
| 新增包体积 | - | +15KB | +15KB（Pretext） |

---

## 5. 依赖与风险

### 5.1 新增依赖

| 包 | 版本 | 大小 | 说明 |
|----|------|------|------|
| `@chenglou/pretext` | latest | ~15KB | 文本测量排版库，零依赖 |

### 5.2 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Pretext 的字体测量与 pdfjs 渲染不完全匹配 | 中 | 用 pdfjs 的 TextItem.transform 坐标校准 Pretext 排版结果 |
| 隐藏文本 div 的选择体验与原生不同 | 低 | Phase 1 不改文本层，仅用行数据增强高亮；Phase 2 再替代 |
| Canvas 文本层无法使用浏览器搜索（Cmd+F） | 中 | 保留隐藏文本 div 支持浏览器原生搜索 |
| Pretext 库成熟度 | 中 | 活跃开发中，但核心 API 稳定；做好降级回退 |

### 5.3 降级策略

每个 Phase 都支持降级回退到当前行为：

```typescript
// useCanvasRendering.ts
const pretextAvailable = pageLayouts.size > 0;
if (pretextAvailable) {
  // 使用 Pretext 行数据计算高亮
  rects = getHighlightRects(layout, ...);
} else {
  // 降级到 getClientRects()
  rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1);
}
```

---

## 6. 实施优先级

```
Phase 1（精确高亮）  ← 优先实施，风险低、价值高
  ↓
Phase 4（双栏选区）  ← 基于 Phase 1 数据，增量开发
  ↓
Phase 2（Canvas 文本层）← 中等风险，需要充分测试
  ↓
Phase 3（虚拟化）    ← 基于 Phase 2，增量优化
```

### Phase 1 预计工作量

| 任务 | 预估 |
|------|------|
| 安装 Pretext + 类型定义 | 0.5h |
| `pretext-text-layer.ts` 实现 | 2h |
| `pretext-hit-test.ts` 实现 | 2h |
| `pretext-line-cache.ts` 实现 | 1h |
| `renderer.ts` 集成 | 1h |
| `useCanvasRendering.ts` 修改 | 2h |
| 测试与调优 | 2h |
| **合计** | **~10.5h** |

---

## 7. 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-30 | v1.0 | 初始版本，Pretext 集成详设 |
