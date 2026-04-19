/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  verbose: true,
  collectCoverage: false,
  collectCoverageFrom: [
    'src/F07/**/*.ts',
    'src/F08/**/*.ts',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: { strict: false },
      },
    ],
  },
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './html-report',
        filename: 'jest_report.html',
        openReport: false,
        pageTitle: 'SQA03 Nhom07 - Unit Test Report',
        expand: true,
      },
    ],
  ],
};
