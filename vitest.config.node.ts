import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts', // 統合テストとフィーチャーテスト
      'src/**/*.test.ts', // 実装と同一ディレクトリの単体テスト
    ],
    exclude: ['tests-d1/**', 'tests/legacy-tests/**'],
    // テストの分離を改善するため、問題のあるテストは順次実行
    sequence: {
      shuffle: false,
      concurrent: false,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
