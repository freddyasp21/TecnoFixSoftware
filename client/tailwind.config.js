/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070b14',
          900: '#0b1220',
          800: '#121a2b',
          700: '#1a2438',
        },
        brand: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        ember: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      boxShadow: {
        card: '0 10px 40px -20px rgba(2, 8, 23, 0.45)',
      },
    },
  },
  plugins: [],
};
