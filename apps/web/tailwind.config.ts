import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--bg-page)",
        sidebar: {
          DEFAULT: "var(--bg-sidebar)",
          foreground: "var(--text-secondary)",
          border: "var(--border-subtle)",
          elevated: "var(--bg-elevated)",
        },
        card: {
          DEFAULT: "var(--bg-card)",
          foreground: "var(--text-primary)",
          elevated: "var(--bg-elevated)",
          border: "var(--border-subtle)",
        },
        border: {
          DEFAULT: "var(--border-subtle)",
          subtle: "var(--border-subtle)",
          dashed: "var(--border-dashed)",
        },
        primary: {
          DEFAULT: "var(--accent-blue)",
          foreground: "#FFFFFF",
        },
        accent: {
          blue: "var(--accent-blue)",
          pink: "var(--accent-pink)",
          red: "var(--accent-red)",
          yellow: "var(--accent-yellow)",
          purple: "var(--accent-purple)",
          cyan: "var(--accent-cyan)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          subtle: "var(--link-subtle)",
          dot: "var(--separator-dot)",
        },
      },
      borderRadius: {
        pill: "4px",
        btn: "8px",
        card: "10px",
        action: "12px",
        banner: "28px",
        full: "9999px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
