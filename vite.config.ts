import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
import { codexAgentPlugin } from "./server/viteCodexAgentPlugin"

const config = defineConfig({
  plugins: [react(), codexAgentPlugin()],
  server: {
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io"],
  },
  test: {
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/.git/**"],
  },
})

export default config
