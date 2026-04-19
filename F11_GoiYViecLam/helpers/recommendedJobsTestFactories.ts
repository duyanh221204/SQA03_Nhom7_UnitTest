/**
 * Factory dữ liệu cho unit test "Việc làm gợi ý theo CV" (ứng viên).
 * Tái sử dụng entity CV domain và cấu trúc raw giống kết quả từ repository.
 */

import type { CVProps } from '../../../src/modules/cv/domain/entities/CV';
import { CV } from '../../../src/modules/cv/domain/entities/CV';

/** CV tối thiểu thuộc về ứng viên (đủ field bắt buộc của entity CV). */
export function buildOwnedCandidateCv(overrides: Partial<CVProps> = {}): CV {
  return new CV({
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    userId: '11111111-1111-1111-1111-111111111111',
    title: 'CV ứng viên test',
    isMain: true,
    isOpenForJob: true,
    ...overrides,
  });
}

/** Một dòng recommend từ DB (shape tương thích với findRecommendedJobsForCV). */
export function buildRecommendedJobRow(overrides: {
  job?: Record<string, unknown>;
  similarity?: number;
} = {}) {
  const baseJob = {
    id: 'job-11111111-1111-1111-1111-111111111111',
    title: 'Lập trình viên Backend',
    description: 'Mô tả công việc',
    location: 'Hà Nội',
    jobType: 'FULL_TIME',
    experienceLevel: 'MID',
    industry: 'IT',
    salary: {
      minAmount: 15000000,
      maxAmount: 25000000,
      currency: 'VND',
    },
    company: {
      id: 'comp-11111111-1111-1111-1111-111111111111',
      name: 'Công ty ABC',
      logoUrl: 'https://cdn.example.com/logo.png',
    },
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    ...overrides.job,
  };
  return {
    job: baseJob,
    similarity: overrides.similarity ?? 0.87,
  };
}
