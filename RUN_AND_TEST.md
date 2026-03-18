# 🚀 运行和测试指南

## ✅ 迁移已完成！

所有代码已成功从 Next.js 迁移到 Tauri + Vite。

## 📋 前提条件

### 已安装 ✓
- ✅ Node.js v25.7.0
- ✅ npm 11.10.1
- ✅ Rust 1.92.0
- ✅ Cargo 1.92.0

### macOS 系统要求
- ✅ Xcode Command Line Tools (已安装)

## 🛠️ 快速开始

### 方法 1: 一键运行（推荐）

```bash
# 在项目根目录 /Users/huangyuxiao/projects/mvp/reader 运行
npm run tauri dev
```

**首次运行说明：**
- 会自动安装 Rust 依赖（约 5-10 分钟）
- 会启动 Vite 开发服务器（前端）
- 会启动 Tauri 桌面应用

### 方法 2: 分步运行

**1. 仅运行前端（测试 UI）：**
```bash
npm run dev
```
访问 http://localhost:5173

**2. 运行完整应用：**
```bash
npm run tauri dev
```

## 📦 已完成的配置

### 前端 (已完成)
- ✅ Vite 6.0 + React 18
- ✅ TypeScript 5.3
- ✅ Tailwind CSS 3.4
- ✅ pdfjs-dist 4.0
- ✅ fabric.js 6.0
- ✅ @tauri-apps/api 2.0

### 后端 (已完成)
- ✅ Tauri 2.x
- ✅ tauri-plugin-dialog 2.x (文件对话框)
- ✅ tauri-plugin-fs 2.x (文件系统)
- ✅ tauri-plugin-shell 2.x (Shell 命令)
- ✅ SQLite (sqlx 0.7)
- ✅ reqwest 0.11 (HTTP 客户端)
- ✅ keyring 2 (系统密钥链)

### 数据库 Schema (已创建)
- ✅ documents 表
- ✅ annotations 表
- ✅ notes 表
- ✅ conversations 表
- ✅ messages 表
- ✅ settings 表

## 🐛 可能遇到的问题

### 问题 1: Rust 编译慢

**原因：** 首次编译需要下载和编译大量依赖

**解决：**
```bash
# 耐心等待 5-10 分钟
# 或者使用 release 模式（更慢但性能更好）
npm run tauri build
```

### 问题 2: 前端 HMR 不工作

**解决：**
```bash
# 重启 Vite 服务器
# 按 Ctrl+C 停止，然后重新运行
npm run tauri dev
```

### 问题 3: 数据库错误

**解决：**
```bash
# 删除数据库并重新初始化
rm -rf ~/Library/Application\ Support/com.immersive-ai-reader/
```

### 问题 4: API Key 未保存

**原因：** 系统 keychain 权限问题

**解决：**
- macOS 会弹出权限请求，点击"允许"
- 或在"系统偏好设置 > 安全性与隐私"中授予权限

## 🎯 测试清单

### 基础功能测试
- [ ] 应用能正常启动
- [ ] UI 正常显示（侧边栏、画布、AI 面板）
- [ ] 点击"上传"按钮打开文件对话框
- [ ] 选择 PDF 文件并加载
- [ ] PDF 正常渲染在画布上
- [ ] 缩放功能正常

### AI 功能测试
- [ ] 打开设置，输入 API Key
- [ ] API Key 保存成功
- [ ] 在 AI 面板输入消息
- [ ] AI 正常响应
- [ ] 对话历史保存

### 数据持久化测试
- [ ] 重启应用后，PDF 列表仍然存在
- [ ] 对话历史仍然存在
- [ ] API Key 仍然保存

## 📊 性能指标

### 预期性能
- 应用启动时间: < 2s
- PDF 加载时间（100页）: < 3s
- AI 响应时间: < 2s
- 内存占用: < 300MB
- 应用包大小: 15-25MB

## 🔧 开发工具

### 查看数据库
```bash
sqlite3 ~/Library/Application\ Support/com.immersive-ai-reader/reader.db

# 常用查询
.tables
SELECT * FROM documents;
SELECT * FROM messages;
.quit
```

### 查看日志
- 前端日志: 浏览器 DevTools (Cmd+Option+I)
- Rust 日志: 终端输出

### 调试 Rust 代码
在 `src-tauri/src/` 中的 Rust 文件添加：
```rust
println!("Debug info: {:?}", variable);
```

## 🚢 构建生产版本

### 构建 macOS 应用
```bash
npm run tauri build
```

**输出位置：**
- 应用包: `src-tauri/target/release/bundle/macos/`
- DMG 安装包: `src-tauri/target/release/bundle/dmg/`

### 应用签名（可选）
如需签名，编辑 `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
    }
  }
}
```

## 📁 关键文件位置

### 前端
- 入口: `src/main.tsx`
- 主组件: `src/App.tsx`
- Tauri Commands: `src/lib/tauri/commands.ts`
- Hooks: `src/hooks/usePDF.ts`, `src/hooks/useAI.ts`, `src/hooks/useSettings.ts`

### 后端
- 主入口: `src-tauri/src/main.rs`
- 库定义: `src-tauri/src/lib.rs`
- Commands: `src-tauri/src/commands/`
- 数据模型: `src-tauri/src/models/`
- 数据库: `src-tauri/src/database/`

### 配置
- Tauri 配置: `src-tauri/tauri.conf.json`
- Cargo 配置: `src-tauri/Cargo.toml`
- Vite 配置: `vite.config.ts`
- TypeScript 配置: `tsconfig.json`

## 🎨 UI 测试要点

### 样式检查
- [ ] 字体正确加载 (Inter, Space Grotesk)
- [ ] Tailwind CSS 类正常工作
- [ ] 颜色主题正确
- [ ] 响应式布局正常

### 交互检查
- [ ] 侧边栏按钮悬停效果
- [ ] AI 面板滚动流畅
- [ ] 设置弹窗动画正常
- [ ] Toast 消息显示和消失

## 🔍 故障排查

### 应用崩溃
1. 检查 Rust 编译错误
2. 检查浏览器 Console 错误
3. 查看系统日志: `/var/log/system.log`

### 功能异常
1. 检查 Tauri Commands 是否正确注册
2. 检查前端是否正确调用 `invoke()`
3. 检查数据库连接是否正常

### 性能问题
1. 使用 Activity Monitor 检查内存和 CPU
2. 检查是否有大量 PDF 页面缓存
3. 检查数据库查询是否优化

## 📞 获取帮助

如果遇到问题：
1. 查看 `IMPLEMENTATION_COMPLETE.md` 详细文档
2. 检查 Tauri 官方文档: https://tauri.app/v2/guides/
3. 查看项目 Issues: [GitHub Issues]

---

## 🎉 下一步

1. 运行 `npm run tauri dev`
2. 等待编译完成（5-10 分钟）
3. 测试所有功能
4. 构建生产版本

**祝开发顺利！** 🚀
