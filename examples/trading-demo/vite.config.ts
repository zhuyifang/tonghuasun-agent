import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': 'http://127.0.0.1:17281',
      '/openapi.json': 'http://127.0.0.1:17281',
    },
  },
})
