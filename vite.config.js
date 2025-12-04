import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: './',
  plugins: [react()], 
  resolve: {
    alias: {
      './App.jsx': '/App.jsx'
    }
  },
  base: './',
  build: {
    outDir: 'dist', 
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
});
