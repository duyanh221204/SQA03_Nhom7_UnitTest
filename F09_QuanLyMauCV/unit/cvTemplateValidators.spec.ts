/**
 * Unit tests: cvTemplateValidators (Zod)
 * Module: Quản lý mẫu CV – validation đầu vào API
 */

import {
  createTemplateSchema,
  updateTemplateSchema,
  templatePaginationSchema,
} from '../../../src/modules/cv/interfaces/validators/cvTemplateValidators';

describe('cvTemplateValidators', () => {
  /**
   * CVT_UT_070
   * Mục tiêu: createTemplateSchema chấp nhận name + htmlUrl hợp lệ.
   */
  it('CVT_UT_070 should parse valid create template body', () => {
    const parsed = createTemplateSchema.parse({
      name: 'Mẫu hợp lệ',
      htmlUrl: 'https://example.com/a.html',
      isActive: 'true',
    });
    expect(parsed.name).toBe('Mẫu hợp lệ');
    expect(parsed.isActive).toBe(true);
  });

  /**
   * CVT_UT_071
   * Mục tiêu: Tên rỗng → lỗi Zod.
   */
  it('CVT_UT_071 should reject empty name on create', () => {
    expect(() =>
      createTemplateSchema.parse({
        name: '',
        htmlUrl: 'https://example.com/a.html',
      }),
    ).toThrow();
  });

  /**
   * CVT_UT_072
   * Mục tiêu: Tên vượt 100 ký tự → lỗi.
   */
  it('CVT_UT_072 should reject name longer than 100 characters', () => {
    expect(() =>
      createTemplateSchema.parse({
        name: 'x'.repeat(101),
        htmlUrl: 'https://example.com/a.html',
      }),
    ).toThrow();
  });

  /**
   * CVT_UT_073
   * Mục tiêu: updateTemplateSchema cho phép body rỗng (partial update).
   */
  it('CVT_UT_073 should allow empty object for update schema', () => {
    const parsed = updateTemplateSchema.parse({});
    expect(parsed).toEqual({});
  });

  /**
   * CVT_UT_074
   * Mục tiêu: templatePaginationSchema – limit vượt 100 → lỗi.
   */
  it('CVT_UT_074 should reject limit greater than 100', () => {
    expect(() =>
      templatePaginationSchema.parse({
        page: 1,
        limit: 101,
      }),
    ).toThrow();
  });

  /**
   * CVT_UT_075
   * Mục tiêu: templatePaginationSchema – mặc định page=1, limit=10.
   */
  it('CVT_UT_075 should apply default pagination values', () => {
    const parsed = templatePaginationSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
  });
});
