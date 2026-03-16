# Immersive AI Reader

An open-source PDF reader with canvas-based interaction and AI-powered conversation.

## Features

- **PDF Upload & Parsing**: Upload PDF files up to 100MB and 500 pages
- **Canvas Rendering**: Interactive canvas with zoom and pan
- **AI Conversation**: Chat with your documents using Zhipu GLM-4 or Minimax
- **Annotations**: Highlight text and add notes
- **Local Storage**: All data stored locally in IndexedDB

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **UI**: React 18+, TypeScript 5+, Tailwind CSS 3+
- **Canvas**: Fabric.js 6+
- **PDF**: PDF.js 4+
- **Components**: Radix UI, Lucide React
- **AI**: Zhipu GLM-4, Minimax
- **Storage**: IndexedDB

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

## Configuration

### AI Provider Setup

1. Click Settings in the sidebar
2. Select your AI provider (Zhipu or Minimax)
3. Enter your API key

### Environment Variables (Optional)

Create `.env.local`:

```env
AI_PROVIDER_DEFAULT=zhipu
MAX_FILE_SIZE_MB=100
MAX_PAGE_COUNT=500
```

## Deployment

### Vercel (Recommended)

```bash
vercel
```

### Docker

```bash
docker-compose up -d
```

## Project Structure

```
/src
  /app                 # Next.js App Router
    /api/chat          # AI chat API endpoint
    page.tsx           # Main page
  /components
    /ui                # Basic UI components
    /layout            # Layout components
    /features          # Feature components
  /lib
    /pdf               # PDF parsing and rendering
    /canvas            # Canvas management
    /annotation        # Annotation layer
    /ai                # AI client modules
    /storage           # IndexedDB storage
    /utils             # Utility functions
  /hooks               # React hooks
  /types               # TypeScript types
  /constants           # Application constants
```

## Testing

```bash
npm test
```

## License

MIT

## Author

Built with Claude Sonnet 4.6
