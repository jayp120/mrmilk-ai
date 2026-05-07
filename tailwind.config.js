/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./main.tsx", "./src/**/*.{js,jsx,ts,tsx}", "./mrmilk-ai.jsx"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Sans"', "sans-serif"],
        display: ['"Cormorant Garamond"', "serif"],
        accent: ['"General Sans"', "sans-serif"],
      },
      boxShadow: {
        glow: "0 24px 80px rgba(0, 0, 0, 0.22)",
      },
    },
  },
  plugins: [],
};
