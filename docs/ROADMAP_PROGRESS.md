# Immersive AI Reader Roadmap Progress

Last updated: 2026-03-24
Source of truth: `research/vibero-immersive-reader/沉浸式AI阅读器_PRD.md`

## Current Goal (PRD Effect First)

Focus: 先完成 PRD 的“中高优先体验闭环”，再推进 P2 扩展能力。  
Current sprint target: AI 上下文感知增强 + 画布交互升级 + 导出分享完善 + 效果指标持续追踪。

---

## Milestone A - Foundation (Done)

- [x] PDF upload via native dialog
- [x] Stable PDF rendering (no blank screen)
- [x] Selectable PDF text layer
- [x] Zoom controls (buttons + Ctrl/Cmd + wheel)
- [x] Page indicator (`Page x / y`) while scrolling
- [x] TOC extraction from PDF outline
- [x] TOC jump navigation
- [x] TOC sidebar entry from topbar
- [x] TOC sidebar entry from right-click menu
- [x] AI chat panel (basic document QA flow)
- [x] API key settings persistence
- [x] Local document metadata persistence (SQLite)
- [x] Auto-restore latest document on app start
- [x] Recent document list in sidebar
- [x] Recent documents deduplication and delete action
- [x] Text highlight and annotation linked to source location
- [x] Note cards anchored to page/selection
- [x] Robust document reopen for moved/deleted files (better fallback UX)
- [x] Section-level/paragraph-level summary generation
- [x] Inline translation for selected text
- [x] Export notes/annotations (Markdown/PDF)

---

## Milestone B - PRD Effect Parity (Now In Progress)

### B1. AI 上下文感知增强（PRD 4.2.2 对齐）

- [x] 引用溯源：答案内引用可点击回跳到原文高亮位置
- [x] 当前阅读位置感知：提问默认绑定当前页/当前选区上下文
- [x] Chat 响应渲染升级：支持 Markdown/GFM（列表、代码块、表格、引用）
- [x] Chat 产品手感优化：thinking 状态、重试、复制、会话 token/延迟提示
- [x] Chat 流式输出体验（后端真实流式）+ Stop 生成（可中断上游请求）
- [x] 消息操作统一工具栏（复制 / 重试 / 固定到画布）
- [x] 术语解释模式：选中术语后一键轻量解释（Explain Term / 右键菜单入口）
- [x] 问答结果卡片化：可将 AI 回答拖入画布作为笔记卡片

### B2. 画布交互升级（PRD 4.2.1 对齐）

- [ ] 无限画布基础能力（非单列文档流）
- [ ] 内容块可拖拽布局（PDF块、笔记块、问答块）
- [x] 多视图区域（至少支持 2 个工作视区）
- [x] 笔记卡 Markdown 编辑（基础格式：标题/列表/代码）
- [x] TOC 当前章节高亮（随滚动同步）
- [x] TOC 悬浮快捷入口（右下角快速打开）

### B2+. 思考画布（右侧画布，方案 A - 推荐）

- [x] 右侧画布区域（AIPanel 内置 Tab，Chat/Canvas 切换）
- [x] 画布内笔记/AI 卡自由拖动定位
- [x] 画布独立布局状态持久化（App 层管理）
- [x] 画布收起/展开（Tab 切换，专注阅读模式）
- [x] AI Panel 内置 Canvas Tab（AI 卡可直接拖入画布）
- [x] 拖入画布自动解除页面锚定（画布内卡片独立定位）
- [ ] 画布视图快照导出
- [x] Canvas Tab 替换为 Notes Manager 快捷按钮（2026-03-19）
- [x] 侧边栏重新设计：Library/Pages Tab、文档按时间分组、Pages Tab 页面导航（2026-03-19）
- [x] Pages Tab 真实缩略图：2列网格、懒加载渲染、JPEG缓存、页面数字标签、当前页红点指示（2026-03-20）
- [x] Library Management System：顶部 Tab 栏（固定 Library Tab + 动态文档 Tab）、3 栏管理视图（左侧库列表/Recent、中间文档列表/网格切换、右侧文档详情/Tags）、标签系统（文档私有 + 全局自动补全）、文档移动到库、右键菜单、Recent 文档追踪（2026-03-20）

### B2++. 拖拽内容到 AI Panel

- [x] AI 卡拖入 Canvas（Pointer Events 方案，替代失效的 HTML5 DnD，Tauri WebView 跨容器拖拽支持，2026-03-20）
- [x] 拖拽选中文字/便签到 AI Panel 作为上下文附件（文本拖拽手柄 + 右键菜单 + Pointer Events 方案，2026-03-20）
- [x] AI Panel 附件区：输入框上方显示附件 chips（type + page + preview + ×，hover 显示移除按钮，2026-03-20）
- [x] 多附件叠加发送（附件拼接进 prompt 上下文，带来源标签，发送后自动清除，2026-03-20）
- [ ] 拖拽 PDF 图片元素到 AI Panel（多模态支持）
- [ ] 后端多模态消息格式支持

### B2+. 笔记管理（扩展功能）

- [x] 笔记管理面板（全局列表、搜索、编辑、删除）
- [x] AI Panel Header 快捷入口（Notes 按钮打开笔记管理）（2026-03-19）
- [x] 笔记标签系统：annotation_tags 表 + Tag.color 字段，Preset Tags（重要/疑问/引用/待整理），预设色板（8色），Rust 增删改查，TypeScript 类型定义，标签色块显示 + 管理弹窗 UI（2026-03-24）
- [ ] 笔记导出增强（带格式）

### B3. 导出与分享完善（PRD 4.2.4 对齐）

- [ ] 导出 PDF（包含高亮与笔记）
- [ ] 导出图片（当前画布视图快照）
- [ ] 导出结构化包（文档元数据 + 标注 + 对话）
- [ ] 分享预留（本地 share package，后续接云端链接）

### B4. 跨设备同步策略（PRD/P1 对齐）

- [x] 本地文档身份持久化：按 file_path 去重，重复打开同一文件保留原 document_id（对话/笔记不丢失）（2026-03-20）
- [ ] 增量同步协议草案（时间戳 + 变更集 + 冲突字段）
- [ ] 云端可选同步接口预留（不阻塞纯本地模式）

---

## Performance Optimizations (2026-03-20)

- [x] PDF 懒加载渲染：前 5 页立即渲染，其余 IntersectionObserver 触发（每批 5 页），支持 shouldCancel 中断（2026-03-20）
- [x] 滚动当前页检测：从 scroll+RAF+O(n) 遍历优化为 IntersectionObserver（零成本空闲时，2026-03-20）
- [x] CSS content-visibility:auto + contain:layout style：离屏页面跳过渲染/布局计算（2026-03-20）
- [x] 骨架屏 content-visibility:auto：未渲染页骨架也享受跳过计算收益（2026-03-20）
- [x] 预测性预加载 + Focused Queue：初始 5 页完成后立即开始渲染 6–10 页，队列只保留 maxLoadedPage+2 范围（2026-03-20）
- [x] 页面缩略图缓存：基于文件指纹的内存缓存，回访页面时先显示缓存 JPEG 再渲染新 Canvas（2026-03-20）
- [x] 大跳转使用 instant scroll：>300px 跳转用 'auto'（立即），近距离用 'smooth'（2026-03-20）

## Stability & UX Improvements (2026-03-23)

- [x] 阅读进度持久化：last_page 存入数据库，重新打开时恢复上次阅读位置（2026-03-23）
- [x] 笔记卡片自动保存：编辑时 500ms 防抖保存到数据库，blur 立即保存，显示 "saving…" 状态（2026-03-23）
- [x] 键盘快捷键扩展：H=高亮选中文本，N=新建笔记（2026-03-23）
- [x] 空状态引导：Chat 空状态显示 3 个可点击的示例问题芯片（2026-03-23）
- [x] 笔记卡片编辑可发现性：hover 显示编辑/删除按钮，指针光标（2026-03-23）
- [x] 阅读进度条：PDF 画布顶部显示可点击的进度条，显示当前阅读位置（2026-03-23）
- [x] PDF 全文搜索：Cmd/Ctrl+F 打开搜索栏，Enter 搜索所有页面并跳转到第一个匹配结果（2026-03-23）
- [x] 聊天消息时间戳显示（2026-03-20）
- [x] 连续消息合并（2026-03-20）
- [x] Markdown 流式渐进渲染（2026-03-20）
- [x] Citation 正则增强（支持 [ref:pN]、[pN]、page N、第N页等格式，2026-03-20）

---

## P2 - Nice to Have

- [ ] Paper + GitHub repo linked workspace
- [ ] Knowledge graph view
- [ ] Collaboration mode

---

## Quality & Effect KPI Tracking (Continuous)

Update cadence: 每次迭代结束必须更新一次（含现状值、是否达标、阻塞原因）。

| Metric | PRD Target | Current | Status | Notes |
| ------ | ------ | ------ | ------ | ------ |
| PDF parse speed (10 pages) | < 5s | TBD | 🔄 Tracking | 需固定测试样本与环境 |
| Canvas rendering FPS | >= 60 FPS | TBD | 🔄 Tracking | 需记录大文档场景 |
| AI first token latency | < 3s | TBD | 🔄 Tracking | 按 provider 分开统计 |
| Context answer citation hit rate | >= 95% with source jump | TBD | 🔄 Tracking | 新增后统计 |
| Stability (major blocker bugs/week) | 0 | TBD | 🔄 Tracking | 以可复现严重 bug 计 |
| Export success rate | >= 99% | TBD | 🔄 Tracking | Markdown/PDF/Image 分开统计 |

## Completed Task Log

- 2026-03-18: Fixed Vite/Tauri blank screen import mismatch.
- 2026-03-18: Fixed PDF open path parsing error.
- 2026-03-18: Reworked PDF rendering pipeline to per-page canvas + selectable text layer.
- 2026-03-18: Added smooth zoom and page progress display.
- 2026-03-18: Added TOC navigation and TOC sidebar trigger.
- 2026-03-18: Added recent document list and automatic last-document restore.
- 2026-03-18: Added recent-doc cleanup (dedupe + invalid history prune) and delete support.
- 2026-03-18: Added text selection highlight with annotation persistence.
- 2026-03-18: Added note cards anchored to selected text and persisted via annotations.
- 2026-03-18: Added document relink flow for moved/deleted local files.
- 2026-03-18: Added AI quick actions for summary and translation.
- 2026-03-18: Added Markdown export for highlights/notes.
- 2026-03-18: Roadmap reprioritized to PRD-effect parity and KPI continuous tracking.
- 2026-03-18: Added clickable citation jump (`[ref:pX]`) from AI answers to PDF pages.
- 2026-03-18: Added page/selection-aware prompt context for AI Q&A.
- 2026-03-18: Upgraded chat rendering to Markdown/GFM with improved code/table readability.
- 2026-03-18: Added chat interaction polish (thinking state, retry, copy, token/latency hints).
- 2026-03-18: Added progressive chat rendering, stop generation, and unified assistant message toolbar.
- 2026-03-18: Fixed cross-platform TOC visibility with page-level fallback outline and TOC search.
- 2026-03-18: Added TOC active-item sync highlight and floating TOC quick-open button.
- 2026-03-18: Reduced default prompt/context token footprint (shorter selected text + shorter history window).
- 2026-03-18: Added lightweight term explain mode and request routing by query complexity.
- 2026-03-18: Added session context-aware response cache for repeated queries (cache-hit token/latency hint).
- 2026-03-19: Upgraded to backend-driven real streaming events and implemented upstream cancellation (`start_stream_chat` / `stop_stream_chat`).
- 2026-03-19: Added settings toggle for chat performance visualization (default on), including TTFT display in usage hints.
- 2026-03-19: Added mature input routing UX: Auto/Chat/Doc modes, intent-aware cache isolation, route confidence hints, and one-click retry with route override.
- 2026-03-19: Added low-confidence route confirmation bar before sending (choose Chat vs Doc explicitly) to reduce auto-routing misfires.
- 2026-03-19: Added short-term route preference memory (last 3 explicit Chat/Doc choices) to nudge auto routing in ambiguous cases.
- 2026-03-19: Added route preference memory visualization in Settings (Chat/Doc counts) with one-click reset.
- 2026-03-19: Added cross-session route preference persistence toggle (default on) for remembered Chat/Doc routing behavior.
- 2026-03-19: Scoped route preference memory by document to avoid cross-paper routing contamination.
- 2026-03-19: Added route preference scope label in Settings to show which active document the memory stats apply to.
- 2026-03-19: Added canvas-chat core linkage: pinned AI cards are persisted on page, clickable to locate source chat message, and pinning prioritizes cited page anchors.
- 2026-03-19: Added AI card interaction upgrades: draggable reposition with persisted coordinates and chat-side "Locate Card" jump to canvas anchor.
- 2026-03-19: Refined assistant message action bar UI (compact non-overflow controls) and removed confusing route-specific retry buttons.
- 2026-03-19: Added AI card content controls on canvas (collapsed preview by default + expand/collapse + explicit open-chat action).
- 2026-03-19: Added direct drag-and-drop from chat to canvas to create persisted AI cards at drop location.
- 2026-03-19: Designed and integrated app logo SVG (`public/app-logo.svg`) into sidebar branding.
- 2026-03-19: Added pinned-state feedback in chat messages (pinned badge + disable duplicate pin).
- 2026-03-19: Added optional split compare view (default single view unchanged) to preserve reading quality while enabling side-by-side page comparison.
- 2026-03-19: Enhanced split-view usability with per-document remembered split state, citation-follow mode for compare pane, and one-click Focus Reading mode.
- 2026-03-19: Upgraded split into dual-workspace controls: right pane now supports independent zoom/page jump and can be driven directly from chat via "To Right" action.
- 2026-03-19: Added right-pane independent TOC (search + active section highlight) and compare-page jump history navigation (Back/Forward).
- 2026-03-19: Transformed split view from generic layout into task-oriented reference pane: context badges (Evidence Check / AI Reference / Compare), auto-open on citation clicks, compact two-row controls, and "Verify" action in chat to open cited pages for source verification.
- 2026-03-19: Added note card markdown editing: rendered display (headings/lists/code/bold/italic), double-click to edit with live markdown textarea, Ctrl+Enter/blur to save, Escape to cancel, persisted to SQLite via update_annotation_text.
- 2026-03-19: Comprehensive UI/UX & performance optimization pass:
  - Code splitting: react-markdown + remark-gfm extracted to separate 165KB chunk (main bundle reduced).
  - Global CSS: custom scrollbar (6px, translucent), GPU-accelerated scroll containers, smooth zoom transitions, antialiased text rendering, custom selection color.
  - Toast: slide-in/out animation with exit transition, gradient backgrounds, type-specific icons (CheckCircle/AlertCircle/Info).
  - Button: focus-visible ring (not focus), active press scale(0.97), refined hover states.
  - Input: hover border state, focus-visible ring pattern matching Button.
  - Sidebar: gradient background, document count badge, empty state with icon, active document ring highlight, smooth hover transitions, action buttons fade-in on hover.
  - Canvas toolbar: glassmorphism (backdrop-blur-xl), compact 28px icon buttons, tabular-nums page counter, reduced height (44→44px).
  - Context menu: glassmorphism with blur(20px), scale+fade entry animation, rounded-12 corners.
  - TOC sidebar: slide-in-from-right animation, compact search input, active item highlight, backdrop-blur.
  - Floating TOC button: list icon, hover scale(1.03), active press scale.
  - Loading states: custom pulse animation (gradient orb) replacing generic spinner.
  - Empty states: icon + descriptive text for both canvas and chat.
  - AI Panel: redesigned header with brand icon, quick action chips (pill buttons), polished input area with mode selector, compact send button, memoized session stats.
  - AI messages: smoother enter animation (scale+fade), refined thinking dots (scale pulse), smaller action buttons (22px height), active press scale.
  - PDF pages: reduced shadow depth, subtle border-radius, will-change:transform hint, smooth box-shadow transition.
- 2026-03-19: Added thinking canvas (right-side free-form canvas) with dot-grid background, free drag-and-drop card layout, canvas card state persistence to localStorage, canvas/Reference panel toggle in toolbar, card count display, and "→ page" jump-to-source links.
- 2026-03-19: Refactored canvas to AIPanel tab (Chat/Canvas tab bar). Canvas now lives inside AIPanel as a tab — AI cards can be directly dragged from chat into canvas. Removed separate canvas toolbar button and panel from MainCanvas. TOC button replaced with icon-only floating button.
- 2026-03-19: Code quality & stability improvements:
  - Added React ErrorBoundary component to prevent white screens on crashes.
  - Added Zod schema validation for settings to prevent crashes from corrupted localStorage.
  - Extracted markdown parser from useCanvasRendering.ts to standalone utility.
  - Fixed memory leak in AI card drag handlers (proper event listener cleanup).
  - Removed dead code: lib/storage/, lib/canvas/manager.ts, lib/annotation/layer.ts.
  - Updated ESLint config for Vite/React (replaced Next.js config).
- 2026-03-19: Network reliability improvements:
  - Added network retry with exponential backoff (3 retries, 1-8s delay) in Rust backend.
  - Added retry utilities for frontend with jitter and retryable error detection.
  - Added debounced auto-save utility for annotation persistence.
- 2026-03-19: Bug fixes:
  - Fixed right-click "Add Note" not working: deferred window.prompt with setTimeout to allow context menu to close first, preserving text selection state.
  - Fixed drag AI card from AIPanel to PDF canvas: moved event.preventDefault() to the start of handleDrop to properly accept the drop before reading dataTransfer.
  - Fixed ai-card repositioning drag not attaching when annotationId is undefined.
  - Fixed AI card body to render markdown (was using textContent, now uses innerHTML with simpleMarkdownToHtml).
  - Added Unpin button directly on AI card (was only available in chat panel).
  - Removed Canvas Tab from AIPanel, replaced with Notes Manager quick button.
  - Cleaned up all canvas-related dead code from AIPanel (canvas state, drag handlers, canvas view JSX).
- 2026-03-19: Redesigned sidebar with Library/Pages tabs: Library shows documents grouped by time with search, Pages shows page navigation with progress bars and active indicator; wired up totalPages/currentPage/onJumpToPage props.
- 2026-03-20: Added real PDF page thumbnails to sidebar Pages tab: usePDFThumbnails hook renders pages as JPEG at 120px width with sequential lazy loading and in-memory cache; Pages tab now shows 2-column thumbnail grid with page number badges and active page indicator.
- 2026-03-20: Implemented Library Management System: top tab bar with fixed Library tab + dynamic document tabs (double-click opens doc in new tab); 3-column layout (library list + recent docs, document list with list/grid toggle, document detail with tags); tag system (doc-private + global autocomplete); document move between libraries via right-click menu; recent documents tracking with clear button; conditional canvas rendering to prevent errors in Library tab.
- 2026-03-20: Added library rename via right-click context menu with inline editing (Enter/Escape/blur handling).
- 2026-03-20: Replaced ugly native `<select>` library picker with custom animated dropdown component (absolute-positioned, click-outside dismiss, check indicator).
- 2026-03-20: Redesigned app logo: open book/document SVG with left page (white + text lines) and right page (light pink + AI spark dot + pulse ring), available in light/dark variants.
- 2026-03-20: Fixed tab switching smoothness: LibraryView and DocumentReader now both stay mounted in DOM, visibility toggled via CSS `opacity` + `pointer-events` transitions (no re-render on tab switch).
- 2026-03-20: Fixed Toast auto-dismiss bug: separated exit animation state from onClose callback into independent useEffect to prevent stuck pinned toasts.
- 2026-03-20: Fixed RenderError on Library tab: added guard in useCanvasRendering to skip rendering when containerId is empty (library tab active).
- 2026-03-20: UX/performance optimizations batch:
  - Scroll event throttling: wrapped updateCurrentPage in requestAnimationFrame to avoid triggering setState on every pixel scroll.
  - Keyboard shortcuts: added useKeyboardShortcuts hook with Cmd+G (page jump dialog), +/- (zoom), 0 (reset zoom), PageUp/Down (prev/next page), Cmd+W (close tab), Escape (close panels).
  - PDF loading skeleton: show 2 shimmer skeleton pages while PDF parses, removed when rendering completes.
  - Settings modal entrance animation: replaced generic animate-in with scale(0.96→1) + opacity + backdrop-blur overlay animation.
  - Library dropdown/tag suggestions: added ctxMenuIn animation to .lib-picker__dropdown and .doc-detail__tag-suggestions.
  - AI streaming throttle: SSE chunks now accumulate in refs, flush to React state at 60fps max via requestAnimationFrame (was updating state on every chunk).
  - Quick action disabled state: Explain/Translate chips dim to 40% opacity when no text is selected in PDF; title updates to show prerequisite.
- 2026-03-20: Design system overhaul — Warm Editorial direction (Notion-like warmth):
  - Established design token system in tailwind.config.ts: warm amber accent (#c2410c), warm stone backgrounds (#fafaf9, #f5f5f4), teal for notes (#0d9488), desaturated violet for AI (#7c3aed).
  - Font upgrade: Plus Jakarta Sans (body) + Newsreader (serif display) + JetBrains Mono (code).
  - Systematic batch hex replacement across all component files: MainCanvas, AIPanel, Sidebar, App, LibraryView, Logo, useCanvasRendering, globals.css.
  - Warm color palette applied: all cool slate grays (#E3E8F0, #F1F5F9, #CBD5E1, #64748B, #334155, #1E293B) → warm equivalents.
  - Eliminated cool-toned UI elements: blue focus states → amber, cool gray borders → warm stone, citation blue links → amber, note card blue → teal.
  - Deleted dead code: src/constants/colors.ts (unused color constants).
- 2026-03-20: Bug fixes:
  - Fixed `skeletonEls` ReferenceError: hoisted variable declaration from `try` block to `renderDocument` function scope so `finally` block can access it.
  - Fixed `DialogContent` Radix accessibility warning: added `VisuallyHidden` `DialogTitle` to the dialog portal.
- 2026-03-20: Theme selector feature:
  - Added theme system with 3 options: Warm Light, Dark, Warm Dark.
  - CSS dark mode variables for both `dark` and `warm-dark` themes applied via `[data-theme]` attribute on root div.
  - Appearance section in Settings with visual theme preview cards.
  - Theme persisted in settings via `uiSettings.theme` (Zod-validated).
  - Warm Dark: warm charcoal surfaces (#1c1917), amber accent preserved, teal for notes.
- 2026-03-20: Fixed AI card drag-and-drop (Canvas direction):
  - Root cause: Tauri WebView silently drops `dragover`/`drop` events across container boundaries; HTML5 DnD API unusable for cross-component drops.
  - Solution: Pointer Events with document-level listeners — GripVertical onPointerDown stores payload + adds document pointermove/pointerup; onPointerUp checks if coords over `#pdf-scroll-container` and dispatches `ai-card-drop` CustomEvent; MainCanvas listens and calls `onDropAICard`.
  - aiCardDragState module singleton carries `payload` + `isDragging` flags.
  - Fixed wrong selector (`querySelector('[data-pdf-canvas]')` → `getElementById('pdf-scroll-container')`).
  - Removed dead `handleDragAICard` + `draggingMsgRef` after switching to pointer events.
  - Added `cursor:grab` on GripVertical for affordance.
  - Fixed drag-active border persisting after drop.
- 2026-03-20: UI polish: removed duplicate Upload PDF from sidebar (Library already has it); added Settings button to Library view; redesigned AIPanel header (Logo + title + perf badge, icon-only toolbar with hover tooltips, chip labels without ✦ markers, Locate→Search icon, Verify→BadgeCheck icon).
- 2026-03-20: Canvas → AIPanel text attachment feature (Phase 1): floating Paperclip handle appears on text selection, drag to AIPanel or right-click → "Attach to AI Panel"; note cards draggable to AIPanel via Pointer Events; AIPanel shows attachment chips (type/page/preview + ×), accumulates multiple, sends with prompt context as labeled block; `aiCardDragState` extended to discriminated union supporting both AI cards and note cards; Rust backend unchanged (Phase 1 is text-only).
- 2026-03-20: Fix document identity persistence: `create_document` now checks `file_path` first via `find_by_file_path`; re-opening same file reuses existing document id (preserving AI conversation and notes associations), only updates file metadata (size/pages/text_content); `library_id` and `created_at` preserved.

## Update Rule

When a task is confirmed complete in testing, check it as `[x]` and append one line in `Completed Task Log`.
