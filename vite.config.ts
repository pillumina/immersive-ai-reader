import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // No React plugin - using vanilla ES modules
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },

  // Path aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Worker configuration for pdfjs-dist
  worker: {
    format: 'es',
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'fabric': ['fabric'],
          'markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      // Avoid stale module caches in WebView during Tauri dev.
      'Cache-Control': 'no-store',
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['pdfjs-dist', 'fabric', 'react', 'react-dom'],
    force: true,
  },
});
