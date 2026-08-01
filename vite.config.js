import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // three is by far the largest dep — split it so the shell paints
        // before the scene bundle lands.
        manualChunks: { three: ['three'] },
      },
    },
  },
})
