import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      maxWorkers: 4,
      environment: 'jsdom',
      restoreMocks: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
