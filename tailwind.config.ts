import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ─── Warm Editorial Palette ─────────────────────────────────
      colors: {
        // Primary accent — warm amber (was harsh red #E42313)
        accent: {
          DEFAULT:  '#c2410c',  // base
          hover:    '#9a3412',  // hover
          subtle:   '#fff7ed',  // light bg
          border:   '#fed7aa',  // border tint
          text:     '#7c2d12',  // on-subtle text
        },
        // Backgrounds — warm stone tones
        bg: {
          base:    '#fafaf9',   // page bg (warm white)
          raised:   '#ffffff',   // cards/panels
          hover:    '#f5f5f4',  // hover state
          subtle:   '#fafaf9',  // subtle bg
          active:   '#f5f5f4',  // active state
        },
        // Borders
        border: {
          DEFAULT:  '#e7e5e4',  // base border
          subtle:   '#f5f5f4',  // subtle divider
          strong:   '#d6d3d1',  // emphasis border
        },
        // Text — warm blacks (not pure #000)
        text: {
          primary:   '#1c1917',  // warm near-black
          secondary: '#78716c',  // warm gray
          muted:     '#a8a29e',  // muted
          inverse:   '#fafaf9',  // on-dark bg
        },
        // Semantic
        success: {
          DEFAULT:  '#0d9488',  // teal (notes, positive)
          subtle:   '#f0fdfa',
          border:   '#99f6e4',
        },
        ai: {
          DEFAULT:  '#7c3aed',  // violet (AI cards)
          subtle:   '#f5f3ff',
          border:   '#ddd6fe',
          text:     '#5b21b6',
        },
        danger: {
          DEFAULT:  '#dc2626',
          subtle:   '#fef2f2',
          border:   '#fecaca',
        },
        warning: {
          DEFAULT:  '#d97706',
          subtle:   '#fffbeb',
          border:   '#fde68a',
        },
      },

      // ─── Typography ────────────────────────────────────────────
      fontFamily: {
        sans:  ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // ─── Spacing (4pt base) ────────────────────────────────────
      spacing: {
        '4.5': '1.125rem',  // 18px — between sm and md
      },

      // ─── Border Radius (4 values) ──────────────────────────────
      borderRadius: {
        'sm': '6px',   // buttons, chips, inputs
        'md': '10px',  // cards, panels
        'lg': '16px',  // modals, large containers
        'xl': '24px',  // empty states
      },

      // ─── Shadows (3 semantic levels) ───────────────────────────
      boxShadow: {
        'xs': '0 1px 2px rgba(28, 25, 23, 0.05)',
        'sm': '0 1px 4px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04)',
        'md': '0 4px 12px rgba(28, 25, 23, 0.08)',
        'lg': '0 8px 30px rgba(28, 25, 23, 0.10)',
        'card': '0 2px 8px rgba(28, 25, 23, 0.05), 0 1px 3px rgba(28, 25, 23, 0.04)',
        'ai-card': '0 8px 24px rgba(124, 58, 237, 0.12)',
        'note-card': '0 6px 20px rgba(13, 148, 136, 0.12)',
      },

      // ─── Animation ─────────────────────────────────────────────
      transitionDuration: {
        '75':  '75ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
      },

      // ─── Custom Easing ────────────────────────────────────────
      transitionTimingFunction: {
        'spring':  'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce':  'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
