import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': { target: 'https://backend.mynaai.in', changeOrigin: true, secure: false },
      '/getFiles': { target: 'https://backend.mynaai.in', changeOrigin: true, secure: false },
      '/socket.io': { target: 'https://backend.mynaai.in', changeOrigin: true, secure: false, ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
