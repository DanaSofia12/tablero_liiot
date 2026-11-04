import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo, Vite (5173) reenvía la API y el canal en vivo al backend (8000).
// HQ_BACKEND apunta a otro, por ejemplo una copia de prueba: HQ_BACKEND=127.0.0.1:8010
const backend = process.env.HQ_BACKEND || 'localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://${backend}`,
      '/ws': { target: `ws://${backend}`, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
  },
})
