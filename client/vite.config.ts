import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // `@/…` is `client/src/…` (AGENT.md: absolute imports via tsconfig paths).
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Follows the API's own `PORT` (default 3000); `pnpm dev` starts both with one environment.
        target: `http://localhost:${process.env['PORT'] ?? '3000'}`,
        changeOrigin: true,
      },
    },
  },
});
