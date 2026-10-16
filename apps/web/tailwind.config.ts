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
        // Design System Core Tokens
        bg: "var(--bg)",
        panel: {
          DEFAULT: "var(--panel)",
          raised: "var(--panel-raised)",
        },
        input: "var(--input)",
        hover: "var(--hover)",
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          subtle: "var(--border)",
          dashed: "var(--border-strong)",
        },
        text: {
          DEFAULT: "var(--text)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          primary: "var(--text)",
          secondary: "var(--text-2)",
          muted: "var(--text-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          blue: "var(--accent)",
          pink: "var(--pink)",
          purple: "var(--purple)",
          yellow: "var(--warning)",
          red: "var(--danger)",
        },
        button: {
          DEFAULT: "var(--button)",
          hover: "var(--button-hover)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        purple: "var(--purple)",
        pink: "var(--pink)",

        // Standard shadcn / semantic compatibility aliases
        page: "var(--bg)",
        sidebar: {
          DEFAULT: "var(--panel)",
          foreground: "var(--text-2)",
          border: "var(--border)",
          elevated: "var(--panel-raised)",
        },
        card: {
          DEFAULT: "var(--panel)",
          foreground: "var(--text)",
          elevated: "var(--panel-raised)",
          border: "var(--border)",
        },
        primary: {
          DEFAULT: "var(--button)",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "var(--panel-raised)",
          foreground: "var(--text-2)",
        },
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        secondary: ["13px", { lineHeight: "18px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "36px" }],
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        DEFAULT: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
        full: "9999px",
        btn: "8px",
        card: "12px",
        dialog: "16px",
      },
      boxShadow: {
        overlay: "0 8px 24px rgba(0, 0, 0, 0.35)",
        menu: "0 8px 24px rgba(0, 0, 0, 0.35)",
        dialog: "0 8px 24px rgba(0, 0, 0, 0.35)",
        toast: "0 8px 24px rgba(0, 0, 0, 0.35)",
        "2xl": "0 8px 24px rgba(0, 0, 0, 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
