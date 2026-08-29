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
     * Proxy the API in development so the browser sees one origin.
     *
     * This keeps `VITE_API_URL` at its same-origin default `/api/v1` in every
     * environment — dev server, Docker (nginx proxies the same path), and any
     * future deployment. Pointing the dev build at `http://localhost:3000`
     * instead would make development the one place that needs CORS, which is
     * exactly where a CORS bug hides until production.
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
    // Recharts and React are large and change far less often than app code.
    // Splitting them into their own chunk means a redeploy of the dashboard
    // does not invalidate the vendor bundle in every visitor's cache.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Recharts pulls in d3 and victory-vendor; they belong with it.
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
