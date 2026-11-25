import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0b0d14", soft: "#121522", card: "#171b2b", hover: "#1f2438" },
        line: "#262b40",
        accent: { DEFAULT: "rgb(var(--accent) / <alpha-value>)", soft: "rgb(var(--accent-soft) / <alpha-value>)" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      keyframes: {
        pop: { "0%": { opacity: "0", transform: "translateY(6px) scale(.98)" }, "100%": { opacity: "1", transform: "none" } },
        blink: { "0%,80%,100%": { opacity: ".2" }, "40%": { opacity: "1" } },
      },
      animation: { pop: "pop .18s ease-out", blink: "blink 1.2s infinite" },
    },
  },
  plugins: [],
} satisfies Config;
