import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import base44Plugin from '@base44/vite-plugin'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), base44Plugin()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
})