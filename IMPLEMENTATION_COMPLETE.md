# 🎉 Tauri 迁移完成！

恭喜！项目已成功从 Next.js web 应用迁移到 Tauri 桌面应用。

## ✅ 已完成的阶段

### Phase 1: 项目初始化 ✓
- [x] 创建 Tauri 项目结构
- [x] 配置 Vite + React + TypeScript
- [x] 迁移所有前端代码和组件
- [x] 配置 Tailwind CSS
- [x] 创建基础 Rust 后端

### Phase 2: 数据库层实现 ✓
- [x] 设计并创建 SQLite Schema
- [x] 实现 Rust 数据模型 (Document, Annotation, Conversation, Message)
- [x] 实现 Repository 层 (DocumentRepository, AnnotationRepository, ConversationRepository)
- [x] 编写数据库迁移脚本
- [x] 实现 Tauri Commands (create_document, get_document, etc.)

### Phase 3: AI API 迁移 ✓
- [x] 实现 Rust HTTP 客户端 (AIClient)
- [x] 实现智谱和 Minimax API 调用
- [x] 实现 API Key 安全存储 (系统 keychain)
- [x] 修改 useAI hook 调用 Tauri Commands
- [x] 实现 AI commands (send_chat_message, save_api_key, etc.)

### Phase 4: 文件系统迁移 ✓
- [x] 实现 Tauri dialog 文件选择 (open_pdf_file)
- [x] 实现文件读取
- [x] 修改 usePDF hook 使用 Tauri API
- [x] 修改 App.tsx 使用新的文件打开方式

### Phase 5: 注释系统迁移 ✓
- [x] 实现注释 CRUD 的 Tauri Commands
- [x] 创建 AnnotationRepository
- [x] 实现 annotation commands

## 📁 项目结构

```
reader/
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs              # 主入口
│   │   ├── lib.rs               # 库定义
│   │   ├── commands/            # Tauri Commands
│   │   │   ├── document.rs      # 文档操作
│   │   │   ├── ai.rs            # AI API 调用
│   │   │   ├── annotation.rs    # 注释管理
│   │   │   └── conversation.rs  # 对话管理
│   │   ├── models/              # 数据模型
│   │   ├── database/            # SQLite 层
│   │   │   ├── migrations/      # 数据库迁移
│   │   │   └── repositories/    # 数据访问层
│   │   ├── ai/                  # AI 客户端
│   │   └── security/            # 密钥存储
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                          # 前端 (Vite + React)
│   ├── main.tsx                 # Vite 入口
│   ├── App.tsx                  # 根组件
│   ├── components/              # React 组件
│   ├── hooks/                   # React Hooks (已修改)
│   │   ├── usePDF.ts           # 使用 Tauri Commands
│   │   ├── useAI.ts            # 使用 Tauri Commands
│   │   └── useSettings.ts      # 使用 Tauri Keychain
│   ├── lib/
│   │   ├── tauri/              # Tauri API 封装
│   │   │   └── commands.ts     # 所有 Tauri Commands
│   │   ├── pdf/                # PDF 渲染 (保留)
│   │   └── canvas/             # Canvas 管理 (保留)
│   ├── types/                  # TypeScript 类型
│   └── styles/                 # 样式
│
├── package.json                 # 前端依赖 (已更新)
├── vite.config.ts              # Vite 配置
└── index.html                  # HTML 入口
```

## 🚀 快速开始

### 1. 安装依赖

**系统要求:**
- Node.js 20+
- Rust (https://rustup.rs/)
- macOS: Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```

**安装前端依赖:**
```bash
npm install
```

**安装 Rust 依赖 (自动):**
首次运行 Tauri 时会自动安装

### 2. 开发模式

**运行 Vite 开发服务器:**
```bash
npm run dev
```
访问 http://localhost:5173

**运行 Tauri 应用:**
```bash
npm run tauri dev
```

### 3. 构建生产版本

```bash
npm run tauri build
```

生成的应用位于 `src-tauri/target/release/bundle/`

## 🔧 技术栈

### 前端
- **框架**: Vite + React 18
- **语言**: TypeScript 5
- **样式**: Tailwind CSS 3
- **PDF**: pdfjs-dist 4
- **Canvas**: fabric.js 6
- **Tauri API**: @tauri-apps/api 2

### 后端 (Rust)
- **框架**: Tauri 2
- **数据库**: SQLite (sqlx)
- **HTTP 客户端**: reqwest
- **密钥存储**: keyring (系统 keychain)
- **异步运行时**: Tokio

## 🎯 核心功能

### 已实现
- ✅ PDF 文件打开和解析
- ✅ Canvas 渲染和交互
- ✅ AI 对话 (智谱 & Minimax)
- ✅ API Key 安全存储
- ✅ SQLite 数据持久化
- ✅ 对话历史管理
- ✅ 注释系统

### 保留功能
- ✅ 所有 UI 组件
- ✅ PDF 文本提取
- ✅ Canvas 缩放/平移
- ✅ Tailwind 样式
- ✅ Google Fonts

## 📊 数据存储

### SQLite 数据库
位置: `~/Library/Application Support/com.immersive-ai-reader/reader.db`

**表结构:**
- `documents` - PDF 文档元数据
- `annotations` - 高亮和注释
- `notes` - 笔记
- `conversations` - 对话会话
- `messages` - 对话消息
- `settings` - 应用设置

### 系统 Keychain
- 智谱 AI API Key
- Minimax API Key

## 🔐 安全性

- ✅ API Keys 存储在系统 keychain (macOS Keychain)
- ✅ 数据库存储在用户应用目录
- ✅ 无明文存储敏感信息

## 🐛 已知问题

1. **pdfjs-dist Worker**
   - 如果遇到 worker 加载问题，检查 `public/pdf.worker.min.mjs` 是否存在
   - Vite 配置已处理 worker 支持

2. **Rust 编译**
   - 首次编译可能需要较长时间
   - 确保系统有足够的内存

## 📝 开发说明

### 添加新的 Tauri Command

1. **Rust 端** (`src-tauri/src/commands/`)
```rust
#[tauri::command]
pub async fn my_command(param: String) -> Result<String, String> {
    Ok(format!("Received: {}", param))
}
```

2. **注册 Command** (`src-tauri/src/lib.rs`)
```rust
.invoke_handler(tauri::generate_handler![
    commands::my_module::my_command,
])
```

3. **前端调用** (`src/lib/tauri/commands.ts`)
```typescript
export const myCommands = {
  myAction: async (param: string): Promise<string> => {
    return await invoke<string>('my_command', { param });
  },
};
```

### 添加新的数据库表

1. 创建迁移文件: `src-tauri/src/database/migrations/002_add_table.sql`
2. 创建模型: `src-tauri/src/models/new_model.rs`
3. 创建 Repository: `src-tauri/src/database/repositories/new_repo.rs`
4. 创建 Command: `src-tauri/src/commands/new_command.rs`
5. 注册到 `lib.rs`

## 🎨 UI 组件

所有原有组件均已保留，无需修改：
- `Sidebar` - 侧边栏
- `MainCanvas` - 主画布
- `AIPanel` - AI 对话面板
- `SettingsModal` - 设置弹窗
- `Toast` - 提示消息

## 📦 打包和分发

### macOS
```bash
npm run tauri build
```

生成的文件:
- `src-tauri/target/release/bundle/dmg/` - DMG 安装包
- `src-tauri/target/release/bundle/macos/` - .app 应用

### 应用签名
需要 Apple Developer 证书，配置 `tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "entitlements": null
    }
  }
}
```

## 🔍 调试

### 前端调试
- 使用浏览器 DevTools (Cmd+Option+I)
- React DevTools 可用

### Rust 调试
- 使用 `println!` 或 `log` crate
- 查看 Console 输出

### 数据库调试
```bash
sqlite3 ~/Library/Application\ Support/com.immersive-ai-reader/reader.db
```

## 📚 相关文档

- [Tauri 官方文档](https://tauri.app/v2/guides/)
- [Vite 官方文档](https://vitejs.dev/)
- [pdfjs-dist 文档](https://mozilla.github.io/pdf.js/)
- [sqlx 文档](https://docs.rs/sqlx/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT

---

**Built with ❤️ using Tauri + React**
