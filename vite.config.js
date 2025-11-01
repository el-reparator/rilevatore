import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/campanello/', // Cambia 'campanello' con il nome del tuo repo GitHub
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
