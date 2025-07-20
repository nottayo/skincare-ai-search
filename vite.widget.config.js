import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  build: {
    lib: {
      entry: './src/components/widget-entry.jsx',
      name: 'MamaTegaChatbot',
      fileName: 'chatbot-widget',
      formats: ['umd'],
    },
    // Remove external and output.globals to bundle React
    outDir: 'dist-widget',
    emptyOutDir: true,
  },
}); 
