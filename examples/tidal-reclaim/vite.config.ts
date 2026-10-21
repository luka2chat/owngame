import { defineConfig } from 'vitest/config'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const local = (path:string) => fileURLToPath(new URL(path,import.meta.url))
export default defineConfig({
  base:'./',
  server:{host:'127.0.0.1',port:3017,strictPort:true,fs:{allow:[local('.'),realpathSync(local('public')),realpathSync(local('generated-assets'))]}},
  build:{target:'es2022',assetsInlineLimit:0,chunkSizeWarningLimit:4600,sourcemap:false,rollupOptions:{input:{game:local('index.html'),assets:local('asset-review.html')}}},
  test:{environment:'node',include:['tests/**/*.test.{ts,mjs}']},
})
