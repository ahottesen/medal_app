import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' gjør at appen virker fra hvilken som helst undermappe (f.eks. GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
