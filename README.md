# Immersive AI Reader

An open-source **desktop PDF reader** with canvas-based interaction and AI-powered conversation. Built with **Tauri 2**, **React 18**, and **Rust**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/tauri-v2-green.svg)
![React](https://img.shields.io/badge/react-v18-blue.svg)
![Rust](https://img.shields.io/badge/rust-1.92-orange.svg)

## ✨ Features

- **PDF Upload & Parsing**: Upload PDF files up to 100MB and 500 pages
- **Canvas Rendering**: Interactive canvas with zoom and pan using Fabric.js
- **AI Conversation**: Chat with your documents using Zhipu GLM-4 or Minimax
- **Annotations**: Highlight text and add notes
- **Local Storage**: All data stored locally in SQLite
- **Secure**: API keys stored in system keychain
- **Fast**: Native performance with Tauri + Rust backend
- **Lightweight**: ~15-25MB application size

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Rust** (install from https://rustup.rs/)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd reader
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the application**
   ```bash
   # Option 1: Using the start script (recommended)
   ./start.sh

   # Option 2: Direct command
   npm run tauri dev
   ```

**Note**: First run takes 5-10 minutes to compile Rust dependencies. Subsequent runs are much faster.

## 🛠️ Tech Stack

### Frontend
- **Framework**: Vite 6 + React 18
- **Language**: TypeScript 5.3
- **Styling**: Tailwind CSS 3.4
- **PDF**: pdfjs-dist 4.0
- **Canvas**: Fabric.js 6.0
- **UI Components**: Radix UI, Lucide React

### Backend
- **Runtime**: Tauri 2 (Rust)
- **Database**: SQLite (sqlx)
- **HTTP Client**: reqwest (AI API calls)
- **Security**: keyring (system keychain)
- **Async**: Tokio

## 📁 Project Structure

```
reader/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs        # Entry point
│   │   ├── lib.rs         # App setup
│   │   ├── commands/      # Tauri commands
│   │   ├── models/        # Data models
│   │   ├── database/      # SQLite layer
│   │   ├── ai/            # AI client
│   │   └── security/      # Keychain
│   └── Cargo.toml
│
├── src/                    # Frontend (React)
│   ├── main.tsx           # Vite entry
│   ├── App.tsx            # Root component
│   ├── components/        # React components
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities
│   │   ├── tauri/         # Tauri API wrapper
│   │   ├── pdf/           # PDF processing
│   │   └── canvas/        # Canvas management
│   └── types/             # TypeScript types
│
├── start.sh               # Quick start script
├── clean.sh               # Clean build artifacts
└── package.json
```

## 🎯 Usage

### Open a PDF

1. Click the **Upload** button in the sidebar
2. Select a PDF file (max 100MB, 500 pages)
3. The PDF will render on the canvas
4. Use zoom controls to adjust view

### Configure AI Provider

1. Click **Settings** in the sidebar
2. Choose your AI provider (Zhipu or Minimax)
3. Enter your API key
4. Keys are securely stored in system keychain

### Chat with PDF

1. Open a PDF document
2. Type your question in the AI panel
3. Get AI-powered responses based on PDF content
4. Conversation history is saved automatically

## 🔧 Configuration

### AI Provider Setup

**Zhipu AI (智谱)**
1. Get API key from https://open.bigmodel.cn/
2. Enter in Settings modal
3. Uses GLM-4 model

**Minimax**
1. Get API key from https://api.minimax.chat/
2. Enter in Settings modal
3. Uses abab6.5-chat model

### Database Location

- **macOS**: `~/Library/Application Support/com.immersive-ai-reader/reader.db`

### View Database
```bash
sqlite3 ~/Library/Application\ Support/com.immersive-ai-reader/reader.db
```

## 📊 Database Schema

- **documents**: PDF metadata and content
- **annotations**: Highlights and annotations
- **notes**: User notes
- **conversations**: Chat sessions
- **messages**: Chat messages
- **settings**: Application settings

## 🚢 Build for Production

### Build macOS App
```bash
npm run tauri build
```

**Output**:
- App bundle: `src-tauri/target/release/bundle/macos/`
- DMG installer: `src-tauri/target/release/bundle/dmg/`

### Code Signing (Optional)

Edit `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

**1. Compilation takes too long**
- First compilation takes 5-10 minutes (normal)
- Subsequent runs are much faster (~30 seconds)

**2. "Cannot find module" errors**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**3. Database errors**
```bash
# Reset database
rm -rf ~/Library/Application\ Support/com.immersive-ai-reader/
```

**4. API key not saving**
- Grant keychain access when prompted
- Check System Preferences > Security & Privacy

### Clean Build
```bash
./clean.sh
```

## 📚 Documentation

- **[RUN_AND_TEST.md](./RUN_AND_TEST.md)** - Detailed running and testing guide
- **[IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md)** - Complete implementation details
- **[MIGRATION.md](./MIGRATION.md)** - Migration from Next.js to Tauri

## 🔒 Security

- **API Keys**: Stored in system keychain (macOS Keychain)
- **Data**: All data stored locally in SQLite
- **No telemetry**: No data sent to external servers
- **Open source**: Full source code available for audit

## 🎨 Features in Detail

### Canvas Interaction
- Zoom in/out with smooth animations
- Pan across PDF pages
- Render PDF pages as canvas images
- Support for multi-page documents

### AI Capabilities
- Context-aware responses based on PDF content
- Conversation history maintained
- Multiple AI provider support
- Streaming responses (planned)

### Data Persistence
- Automatic save of all operations
- SQLite for structured data
- Efficient query performance
- Data export (planned)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- [Tauri](https://tauri.app/) - Desktop application framework
- [React](https://react.dev/) - UI library
- [pdf.js](https://mozilla.github.io/pdf.js/) - PDF parsing
- [Fabric.js](http://fabricjs.com/) - Canvas library
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

**Made with ❤️ using Tauri + React + Rust**
