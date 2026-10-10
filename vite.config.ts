import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 }, // pdf.js is big; fine for a local app
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/files': api,
    },
  },
});
