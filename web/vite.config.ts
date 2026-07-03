import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All API calls go to the Express server; the browser never talks to
      // Airwallex's REST API directly (only to the Airwallex.js element SDK).
      '/api': 'http://localhost:3001',
      // Remote MCP endpoint lives on the server too.
      '/mcp': 'http://localhost:3001',
    },
  },
})
