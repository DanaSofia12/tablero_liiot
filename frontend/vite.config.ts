import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, Vite (5173) reenvía la API y el canal en vivo al backend (8000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
  },
})
