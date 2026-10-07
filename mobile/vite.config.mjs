import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./'),
  publicDir: path('../public'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /.*\/platform\/Link(?:\.jsx)?$/, replacement: path('./Link.jsx') },
      { find: /.*\/platform\/navigation(?:\.js)?$/, replacement: path('./navigation.js') },
    ],
  },
  build: {
    outDir: path('../dist-mobile'),
    emptyOutDir: true,
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
