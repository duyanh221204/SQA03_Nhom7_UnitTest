/**
 * Unit tests: paginationSchema cho query `GET /api/cvs/:cvId/recommended-jobs`
 * (CVController.getRecommendedJobsForCV parse `req.query` bằng schema này).
 */

import { paginationSchema } from '../../../src/modules/cv/interfaces/validators/cvValidators';

describe('recommended jobs query (paginationSchema)', () => {
  /**
   * RJ_UT_010
   * Mục tiêu: Query rỗng — page=1, limit=10 mặc định.
   */
  it('RJ_UT_010 should apply default page and limit', () => {
    const parsed = paginationSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
  });

  /**
   * RJ_UT_011
   * Mục tiêu: limit tối đa hợp lệ = 100 (ứng viên/FE thường dùng 50).
   */
  it('RJ_UT_011 should accept limit at upper bound 100', () => {
    const parsed = paginationSchema.parse({ limit: '100' });
    expect(parsed.limit).toBe(100);
  });

  /**
   * RJ_UT_012
   * Mục tiêu: limit > 100 — Zod từ chối (Bad Request khi gọi API thật).
   */
  it('RJ_UT_012 should reject limit greater than 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  /**
   * RJ_UT_013
   * Mục tiêu: Chuỗi số từ query string được coerce đúng.
   */
  it('RJ_UT_013 should coerce string query params to numbers', () => {
    const parsed = paginationSchema.parse({ page: '2', limit: '25' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(25);
  });
});
