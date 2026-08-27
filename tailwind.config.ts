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
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          50: "hsl(217 45% 97%)",
          100: "hsl(217 42% 92%)",
          200: "hsl(217 40% 83%)",
          300: "hsl(217 38% 68%)",
          400: "hsl(217 36% 52%)",
          500: "hsl(217 40% 38%)",
          600: "hsl(217 45% 28%)",
          700: "hsl(218 48% 21%)",
          800: "hsl(218 50% 18%)",
          DEFAULT: "var(--brand-primary, #14233C)",
          900: "var(--brand-primary, #14233C)",
          foreground: "#FFFFFF"
        },
        accent: {
          50: "hsl(171 65% 96%)",
          100: "hsl(171 60% 89%)",
          200: "hsl(171 58% 78%)",
          300: "hsl(171 58% 62%)",
          400: "hsl(171 65% 50%)",
          500: "hsl(171 77% 41%)",
          DEFAULT: "var(--brand-accent, #18B7A0)",
          600: "hsl(172 80% 33%)",
          700: "hsl(173 82% 26%)",
          800: "hsl(174 80% 20%)",
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
        lg: "10px",
        md: "8px",
        sm: "6px"
      },
      boxShadow: {
        soft: "0 10px 30px rgba(20, 35, 60, 0.08)",
        card: "0 1px 2px rgba(20, 35, 60, 0.04), 0 8px 24px rgba(20, 35, 60, 0.06)",
        "card-hover": "0 4px 10px rgba(20, 35, 60, 0.06), 0 16px 40px rgba(20, 35, 60, 0.12)",
        glow: "0 0 0 1px rgba(24, 183, 160, 0.16), 0 8px 30px rgba(24, 183, 160, 0.22)"
      },
      transitionTimingFunction: {
        fluid: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
