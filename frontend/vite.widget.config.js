import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'process': { env: {} },
  },
  build: {
    lib: {
      entry: './src/components/widget-entry.jsx',
      name: 'MamaTegaChatbot',
      fileName: 'chatbot-widget',
      formats: ['umd'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    outDir: 'search-widget',
    emptyOutDir: true,
  },
}); 