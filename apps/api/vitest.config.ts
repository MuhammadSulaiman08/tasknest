import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/tasknest_test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      WEB_ORIGIN: 'http://localhost:3000',
    },
  },
});
