import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F5F7",
        surface: "#FFFFFF",
        ink: "#1D1D1F",
        secondary: "#6E6E73",
        hairline: "#D2D2D7",
        accent: "#1B3A4B",
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
