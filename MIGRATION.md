# Tauri 迁移说明

## 项目已从 Next.js 迁移到 Tauri + Vite

### 已完成的更改

1. **创建 Tauri 后端结构**
   - `src-tauri/` 目录已创建
   - 包含基本的 Rust 配置文件
   - `Cargo.toml` 已配置所需依赖

2. **前端迁移到 Vite**
   - 从 Next.js 迁移到 Vite + React
   - 创建了 `src/main.tsx` (Vite 入口)
   - 创建了 `src/App.tsx` (主应用组件)
   - 创建了 `index.html`
   - 更新了 `package.json` 脚本和依赖
   - 配置了 `vite.config.ts`
   - 更新了 TypeScript 配置

3. **样式和字体**
   - 迁移了 Tailwind CSS 配置
   - 使用 Google Fonts CDN (替代 next/font)
   - 保留了所有自定义主题配置

### 下一步操作

**由于网络连接问题，请手动执行以下步骤：**

1. **安装依赖**
   ```bash
   npm install
   ```

2. **测试 Vite 开发服务器**
   ```bash
   npm run dev
   ```
   应用将在 http://localhost:5173 运行

3. **测试 Tauri 应用**
   ```bash
   npm run tauri dev
   ```

### 需要的依赖

确保你的系统已安装：
- Node.js 20+
- Rust (https://rustup.rs/)
- 系统依赖 (macOS):
  ```bash
  xcode-select --install
  ```

### 项目结构

```
reader/
├── src-tauri/           # Rust 后端 (新增)
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                 # 前端代码 (保留)
│   ├── main.tsx        # Vite 入口 (新增)
│   ├── App.tsx         # 主组件 (从 page.tsx 迁移)
│   ├── components/     # React 组件 (保留)
│   ├── hooks/          # React Hooks (保留)
│   ├── lib/            # 工具库 (保留)
│   ├── styles/         # 样式 (新增目录)
│   └── types/          # TypeScript 类型 (保留)
├── index.html          # HTML 入口 (新增)
├── vite.config.ts      # Vite 配置 (新增)
└── package.json        # 更新了依赖
```

### 待实现的 Phase

- [x] Phase 1: 项目初始化
- [ ] Phase 2: 数据库层实现 (SQLite)
- [ ] Phase 3: AI API 迁移
- [ ] Phase 4: 文件系统迁移
- [ ] Phase 5: 注释系统迁移
- [ ] Phase 6: 优化和测试
- [ ] Phase 7: 数据迁移工具

### 注意事项

1. **PDF Worker**: `pdf.worker.min.mjs` 已在 `public/` 目录，Vite 会正确处理
2. **字体**: 使用 Google Fonts CDN，不再需要本地字体文件
3. **组件**: 所有 React 组件无需修改，继续使用
4. **Hooks**: 暂时保留，后续需要修改调用方式（从 IndexedDB 切换到 Tauri Commands）

### 测试清单

- [ ] Vite 开发服务器正常启动
- [ ] UI 正常显示
- [ ] PDF Canvas 渲染正常
- [ ] Tailwind CSS 样式正确
- [ ] Tauri 应用可以启动

## 后续开发

完成 Phase 1 测试后，将继续：
- Phase 2: 实现 SQLite 数据库层
- Phase 3: 实现 Rust AI API 调用
- Phase 4: 实现 Tauri 文件系统 API
- Phase 5: 实现注释系统持久化

详细计划请参考 `.claude/plans/ethereal-splashing-flurry.md`
