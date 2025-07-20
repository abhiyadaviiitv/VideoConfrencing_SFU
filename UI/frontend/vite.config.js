import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Local dev defaults to HTTP. If you need HTTPS locally, re-enable `server.https`.

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // ...

  server: {
    host: true, // Expose to network
    port: 5173,
    proxy: {
      // REST traffic
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Socket.IO traffic
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
      // Socket.IO namespace /mediasoup
      '/mediasoup': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
