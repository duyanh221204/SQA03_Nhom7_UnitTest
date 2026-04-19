/**
 * Factory CV tối thiểu cho unit test tìm kiếm CV (nhà tuyển dụng / admin).
 */

import type { CVProps } from '../../../src/modules/cv/domain/entities/CV';
import { CV } from '../../../src/modules/cv/domain/entities/CV';

/** CV domain dùng trong kết quả mock của `searchCVs`. */
export function buildCvForSearchResult(overrides: Partial<CVProps> = {}): CV {
  return new CV({
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    userId: '22222222-2222-2222-2222-222222222222',
    title: 'CV Frontend Developer',
    fullName: 'Ứng viên Test',
    isMain: false,
    isOpenForJob: true,
    summary: 'Kinh nghiệm React, TypeScript',
    ...overrides,
  });
}
