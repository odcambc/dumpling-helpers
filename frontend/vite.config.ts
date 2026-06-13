import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Resolve the shared design system to its source so Vite transforms the
      // JSX (files under node_modules are not transformed). Workspace install
      // provides its deps; this alias governs how the app bundles it.
      '@dumplingkit/ui': resolve(__dirname, '../packages/ui/src/index.ts'),
    },
  },
  optimizeDeps: { exclude: ['@dumplingkit/ui'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
