import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // ...

  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../../key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../../cert.pem')),
    },
    host: true, // Expose to network
    port: 5173,
    proxy: {
      // REST traffic
      '/api': {
        target: 'https://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      // Socket.IO traffic
      '/socket.io': {
        target: 'https://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
      // Socket.IO namespace /mediasoup
      '/mediasoup': {
        target: 'https://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
