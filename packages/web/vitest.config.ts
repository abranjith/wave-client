import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/',
        '**/.{git,vscode}/',
        'src/main.tsx', // Entry point
        'src/index.css',
        'src/App.tsx', // Main UI component (requires integration testing)
        'src/components/**', // UI components (requires integration testing)
        'src/adapters/index.ts', // Re-exports only
        'scripts/**', // Build scripts
      ],
      thresholds: {
        lines: 35,
        functions: 30,
        branches: 45,
        statements: 35,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
