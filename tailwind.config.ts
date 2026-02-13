import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        forte: {
          dark: '#1A1A2E',
          gold: '#C4A35A',
          light: '#F5F3EE',
          cream: '#FAFAF7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
