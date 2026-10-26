import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 3027, strictPort: true },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
