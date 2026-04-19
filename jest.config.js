/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  verbose: true,
  collectCoverage: false,
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: '../output/coverage',
  // Collect coverage from extracted source files (F01/F02/F03/F12)
  collectCoverageFrom: [
    'F01_DangKyTaiKhoan/F01.src.ts',
    'F02_DangNhapDangXuat/F02.src.ts',
    'F03_QuanLyViecLamDaUngTuyen/F03.src.ts',
    'F12_QuanLyDonUngTuyen/F12.src.ts',
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          strict: false,
        },
      },
    ],
  },
};
