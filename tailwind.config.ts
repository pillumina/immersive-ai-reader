import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        primary: '#E42313',
        'text-primary': '#0D0D0D',
        'text-secondary': '#7A7A7A',
        'text-muted': '#B0B0B0',
        border: '#E8E8E8',
        surface: '#FAFAFA',
      },
    },
  },
  plugins: [],
}
export default config
