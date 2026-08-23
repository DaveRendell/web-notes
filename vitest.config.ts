import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      restoreMocks: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
