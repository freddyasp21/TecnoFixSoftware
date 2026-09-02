/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#070b14',
          900: '#0b1220',
          800: '#121a2b',
          700: '#1a2438',
        },
        brand: {
          400: '#8B7CFF',
          500: '#5A2EE5',
          600: '#4C1D95',
        },
        flare: {
          400: '#6B6EFB',
          500: '#5255F9',
          600: '#3E41E0',
        },
        canvas: '#F3EEFF',
      },
      boxShadow: {
        card: '0 18px 50px -24px rgba(90, 46, 229, 0.35)',
        soft: '0 8px 30px -12px rgba(76, 29, 149, 0.18)',
      },
    },
  },
  plugins: [],
};
