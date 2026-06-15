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
      // JSX (files under node_modules are not transformed).
      '@dumplingkit/ui': resolve(__dirname, '../../../packages/ui/src/index.ts'),
      '@dumplingkit/bio': resolve(__dirname, '../../../packages/bio/src/index.ts'),
    },
  },
  optimizeDeps: { exclude: ['@dumplingkit/ui', '@dumplingkit/bio'] },
  server: {
    port: 5174,
    strictPort: true,
  },
})
