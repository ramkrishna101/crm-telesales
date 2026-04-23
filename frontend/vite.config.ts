import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
            if (id.includes('react/')) return 'vendor-react';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('recharts') || id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts';
            if (id.includes('socket.io')) return 'vendor-socket';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})


