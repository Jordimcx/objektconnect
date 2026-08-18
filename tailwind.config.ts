import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "var(--brand-primary, #14233C)",
          foreground: "#FFFFFF"
        },
        accent: {
          DEFAULT: "var(--brand-accent, #18B7A0)",
          foreground: "#FFFFFF"
        },
        muted: {
          DEFAULT: "#F4F6F8",
          foreground: "#546179"
        },
        destructive: {
          DEFAULT: "#DC2626",
          foreground: "#FFFFFF"
        }
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(20, 35, 60, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
