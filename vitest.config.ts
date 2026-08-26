import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@usapon-reel/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@usapon-reel/local': fileURLToPath(new URL('./packages/local/src/index.ts', import.meta.url)),
      '@usapon-reel/renderer': fileURLToPath(new URL('./packages/renderer/src/composition.tsx', import.meta.url)),
    },
  },
});
