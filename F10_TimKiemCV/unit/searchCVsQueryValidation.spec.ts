/**
 * Unit tests: searchCVsSchema — query `GET /api/cvs/search`
 * (ứng với parse `req.query` trong CVController.searchCVs).
 */

import { searchCVsSchema } from '../../../src/modules/cv/interfaces/validators/cvValidators';

describe('searchCVsSchema (recruiter CV search query)', () => {
  /**
   * SCR_UT_010
   * Mục tiêu: Query rỗng — page/limit mặc định.
   */
  it('SCR_UT_010 should apply defaults for empty query', () => {
    const parsed = searchCVsSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
  });

  /**
   * SCR_UT_011
   * Mục tiêu: `skills` dạng chuỗi CSV → mảng chuỗi.
   */
  it('SCR_UT_011 should split comma-separated skills string into array', () => {
    const parsed = searchCVsSchema.parse({ skills: 'React,Node.js,PostgreSQL' });
    expect(parsed.skills).toEqual(['React', 'Node.js', 'PostgreSQL']);
  });

  /**
   * SCR_UT_012
   * Mục tiêu: `query` vượt 200 ký tự — Zod từ chối.
   */
  it('SCR_UT_012 should reject query longer than 200 characters', () => {
    expect(() =>
      searchCVsSchema.parse({
        query: 'x'.repeat(201),
      }),
    ).toThrow();
  });

  /**
   * SCR_UT_013
   * Mục tiêu: `limit` > 100 — Zod từ chối.
   */
  it('SCR_UT_013 should reject limit greater than 100', () => {
    expect(() => searchCVsSchema.parse({ limit: 101 })).toThrow();
  });

  /**
   * SCR_UT_014
   * Mục tiêu: Coerce page/limit từ query string.
   */
  it('SCR_UT_014 should coerce string page and limit', () => {
    const parsed = searchCVsSchema.parse({
      page: '3',
      limit: '50',
      query: 'developer',
      location: 'TP.HCM',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
    expect(parsed.query).toBe('developer');
    expect(parsed.location).toBe('TP.HCM');
  });
});
