import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'kernel/**/src/**/*.test.{ts,tsx}',
      'runtime/**/src/**/*.test.{ts,tsx}',
      'plugins/**/src/**/*.test.{ts,tsx}',
      'adapters/**/src/**/*.test.{ts,tsx}',
      'storage/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      include: [
        'kernel/**/src/**/*.{ts,tsx}',
        'runtime/**/src/**/*.{ts,tsx}',
        'plugins/**/src/**/*.{ts,tsx}',
        'adapters/**/src/**/*.{ts,tsx}',
        'storage/**/src/**/*.{ts,tsx}',
        'apps/**/src/**/*.{ts,tsx}',
        'tests/**/src/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
    },
  },
});
