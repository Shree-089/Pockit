import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // During development, /api/* is forwarded to the Express server,
    // so the browser sees one origin and no CORS setup is needed locally.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
