import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig(({ mode }) => {
  // Same flag as the web build: the shell env wins over .env* files at the repo root.
  const env = { ...loadEnv(mode, path('../'), 'NEXT_PUBLIC_'), ...process.env };
  return {
    root: path('./'),
    publicDir: path('../public'),
    plugins: [react()],
    define: {
      'process.env.NEXT_PUBLIC_RESULT_TEXTS': JSON.stringify(env.NEXT_PUBLIC_RESULT_TEXTS ?? ''),
    },
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
  };
});
