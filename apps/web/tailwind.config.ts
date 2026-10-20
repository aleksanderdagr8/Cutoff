import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        hairline: "rgb(var(--color-hairline) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "var(--font-dm-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-syne)",
          "var(--font-dm-sans)",
          "ui-sans-serif",
          "sans-serif",
        ],
      },
      transitionDuration: {
        160: "160ms",
      },
      borderRadius: {
        card: "12px",
        control: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
