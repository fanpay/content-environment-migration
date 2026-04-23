/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        kontent: {
          primary: '#f05a22',
          secondary: '#5e35b1',
          dark: '#1a1a1a',
          light: '#f5f5f5',
        },
      },
    },
  },
  plugins: [],
};
