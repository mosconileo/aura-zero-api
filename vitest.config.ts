import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// SWC no lugar do esbuild: o Nest precisa de emitDecoratorMetadata para DI.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e.ts'],
          globalSetup: ['test/global-setup.ts'],
          // Um arquivo por vez: todos dividem o mesmo banco e Redis de teste.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
