import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
import { codexAgentPlugin } from "./server/viteCodexAgentPlugin"

const config = defineConfig({
  plugins: [react(), codexAgentPlugin()],
  test: {
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/.git/**", "**/.claude/**"],
  },
})

export default config
