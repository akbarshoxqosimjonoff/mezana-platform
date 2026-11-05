import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#01242B",
          dark: "#01181D",
          light: "#053B46",
          muted: "#0A4F5D"
        },
        accent: {
          DEFAULT: "#FBCC42",
          hover: "#F2BE24",
          soft: "#FEF3C7"
        },
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F8FAFC",
          muted: "#F1F5F9"
        },
        ink: {
          DEFAULT: "#0F172A",
          secondary: "#334155",
          muted: "#475569"
        },
        status: {
          success: "#15803D",
          warning: "#B45309",
          danger: "#B91C1C",
          info: "#0369A1"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-noto-arabic)", "system-ui", "sans-serif"],
        heading: ["var(--font-manrope)", "var(--font-noto-arabic)", "system-ui", "sans-serif"],
        arabic: ["var(--font-noto-arabic)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
