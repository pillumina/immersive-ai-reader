# Immersive AI Reader Roadmap Progress

Last updated: 2026-03-18
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
- [ ] 多视图区域（至少支持 2 个工作视区）
- [ ] 笔记卡 Markdown 编辑（基础格式：标题/列表/代码）
- [x] TOC 当前章节高亮（随滚动同步）
- [x] TOC 悬浮快捷入口（右下角快速打开）

### B3. 导出与分享完善（PRD 4.2.4 对齐）

- [ ] 导出 PDF（包含高亮与笔记）
- [ ] 导出图片（当前画布视图快照）
- [ ] 导出结构化包（文档元数据 + 标注 + 对话）
- [ ] 分享预留（本地 share package，后续接云端链接）

### B4. 跨设备同步策略（PRD/P1 对齐）

- [ ] 本地优先数据模型定义（文档/标注/笔记/对话统一 schema）
- [ ] 增量同步协议草案（时间戳 + 变更集 + 冲突字段）
- [ ] 云端可选同步接口预留（不阻塞纯本地模式）

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

## Update Rule

When a task is confirmed complete in testing, check it as `[x]` and append one line in `Completed Task Log`.
