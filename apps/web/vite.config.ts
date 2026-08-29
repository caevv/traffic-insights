import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    /**
     * Proxy the API in dev so the browser sees one origin.
     *
     * This keeps VITE_API_URL at its default /api/v1 everywhere: dev server,
     * Docker (nginx proxies the same path), and anywhere we deploy later.
     * Pointing dev at http://localhost:3000 instead would make development the
     * only place that needs CORS, which is where a CORS bug hides until
     * production.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Recharts and React are big and change much less often than our code.
    // Giving them their own chunk means a redeploy doesn't throw away the
    // vendor bundle in everyone's browser cache.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Recharts pulls in d3 and victory-vendor, so they go with it.
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-)/.test(id)) {
            return 'charts'
          }
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return 'react'
          }
          return undefined
        },
      },
    },
  },
})
