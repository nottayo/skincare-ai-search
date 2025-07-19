import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'static-site-dist',
    rollupOptions: {
      input: {
        'cart-button': resolve(__dirname, 'static-site/index.html')
      },
      output: {
        entryFileNames: 'cart-button.js',
        chunkFileNames: 'cart-button-[hash].js',
        assetFileNames: 'cart-button-[hash].[ext]'
      }
    },
    minify: 'terser',
    sourcemap: true
  },
  server: {
    port: 3001
  }
}); 