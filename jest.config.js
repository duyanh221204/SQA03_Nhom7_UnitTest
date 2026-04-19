/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  verbose: true,
  collectCoverage: false,
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Each file compiled in isolation – prevents cross-file duplicate-identifier errors
        isolatedModules: true,
        tsconfig: {
          strict: false,
        },
      },
    ],
  },
};
