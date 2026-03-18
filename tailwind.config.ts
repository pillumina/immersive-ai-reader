import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#E42313',
        'text-primary': '#0D0D0D',
        'text-secondary': '#7A7A7A',
        'text-muted': '#B0B0B0',
        border: '#E8E8E8',
        surface: '#FAFAFA',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
