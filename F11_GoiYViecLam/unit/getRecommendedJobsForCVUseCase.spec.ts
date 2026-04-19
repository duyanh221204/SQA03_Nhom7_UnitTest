/**
 * Unit tests: GetRecommendedJobsForCVUseCase
 * Use case: Ứng viên xem danh sách việc làm được gợi ý theo CV (`GET /api/cvs/:cvId/recommended-jobs`).
 *
 * Repository được mock — không ghi PostgreSQL.
 */

import { GetRecommendedJobsForCVUseCase } from '../../../src/modules/cv/application/use-cases/GetRecommendedJobsForCVUseCase';
import type { ICVRepository } from '../../../src/modules/cv/domain/repositories/ICVRepository';
import { AuthorizationError, NotFoundError } from '../../../src/shared/domain/errors/index';
import { buildOwnedCandidateCv, buildRecommendedJobRow } from '../helpers/recommendedJobsTestFactories';

function createMockCvRepository(): jest.Mocked<ICVRepository> {
  return {
    findById: jest.fn(),
    findRecommendedJobsForCV: jest.fn(),
  } as unknown as jest.Mocked<ICVRepository>;
}

describe('GetRecommendedJobsForCVUseCase', () => {
  let mockCvRepository: jest.Mocked<ICVRepository>;
  let useCaseUnderTest: GetRecommendedJobsForCVUseCase;

  const candidateUserId = '11111111-1111-1111-1111-111111111111';
  const cvId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(() => {
    mockCvRepository = createMockCvRepository();
    useCaseUnderTest = new GetRecommendedJobsForCVUseCase({ cvRepository: mockCvRepository });
  });

  /**
   * RJ_UT_001
   * Mục tiêu: CV tồn tại, đúng chủ sở hữu — trả về danh sách job đã map (similarity, company, salary).
   */
  it('RJ_UT_001 should return mapped recommended jobs when CV belongs to user', async () => {
    mockCvRepository.findById.mockResolvedValue(buildOwnedCandidateCv({ id: cvId, userId: candidateUserId }));
    mockCvRepository.findRecommendedJobsForCV.mockResolvedValue([buildRecommendedJobRow()]);

    const result = await useCaseUnderTest.execute({
      cvId,
      userId: candidateUserId,
      limit: 20,
    });

    expect(mockCvRepository.findRecommendedJobsForCV).toHaveBeenCalledWith(cvId, 20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('job-11111111-1111-1111-1111-111111111111');
    expect(result.data[0].similarity).toBe(0.87);
    expect(result.data[0].jobType).toBe('FULL_TIME');
    expect(result.data[0].company?.name).toBe('Công ty ABC');
    expect(result.data[0].salary?.currency).toBe('VND');
  });

  /**
   * RJ_UT_002
   * Mục tiêu: CV không tồn tại → NotFoundError.
   */
  it('RJ_UT_002 should throw NotFoundError when CV does not exist', async () => {
    mockCvRepository.findById.mockResolvedValue(null);

    await expect(
      useCaseUnderTest.execute({ cvId, userId: candidateUserId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockCvRepository.findRecommendedJobsForCV).not.toHaveBeenCalled();
  });

  /**
   * RJ_UT_003
   * Mục tiêu: CV thuộc user khác → AuthorizationError.
   */
  it('RJ_UT_003 should throw AuthorizationError when CV belongs to another user', async () => {
    mockCvRepository.findById.mockResolvedValue(
      buildOwnedCandidateCv({ id: cvId, userId: '99999999-9999-9999-9999-999999999999' }),
    );

    await expect(
      useCaseUnderTest.execute({ cvId, userId: candidateUserId }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mockCvRepository.findRecommendedJobsForCV).not.toHaveBeenCalled();
  });

  /**
   * RJ_UT_004
   * Mục tiêu: Không truyền limit — mặc định gọi repository với limit = 10.
   */
  it('RJ_UT_004 should default limit to 10 when omitted', async () => {
    mockCvRepository.findById.mockResolvedValue(buildOwnedCandidateCv({ id: cvId, userId: candidateUserId }));
    mockCvRepository.findRecommendedJobsForCV.mockResolvedValue([]);

    await useCaseUnderTest.execute({ cvId, userId: candidateUserId });

    expect(mockCvRepository.findRecommendedJobsForCV).toHaveBeenCalledWith(cvId, 10);
  });

  /**
   * RJ_UT_005
   * Mục tiêu: Không có bản ghi gợi ý — trả về mảng rỗng.
   */
  it('RJ_UT_005 should return empty data array when no recommendations', async () => {
    mockCvRepository.findById.mockResolvedValue(buildOwnedCandidateCv({ id: cvId, userId: candidateUserId }));
    mockCvRepository.findRecommendedJobsForCV.mockResolvedValue([]);

    const result = await useCaseUnderTest.execute({ cvId, userId: candidateUserId, limit: 50 });

    expect(result.data).toEqual([]);
    expect(mockCvRepository.findRecommendedJobsForCV).toHaveBeenCalledWith(cvId, 50);
  });

  /**
   * RJ_UT_006
   * Mục tiêu: Job không có company — output không có block company (undefined sau map).
   */
  it('RJ_UT_006 should omit company when job has no company', async () => {
    mockCvRepository.findById.mockResolvedValue(buildOwnedCandidateCv({ id: cvId, userId: candidateUserId }));
    mockCvRepository.findRecommendedJobsForCV.mockResolvedValue([
      buildRecommendedJobRow({
        job: {
          id: 'job-no-company',
          title: 'Job',
          description: null,
          location: null,
          jobType: null,
          experienceLevel: null,
          industry: null,
          salary: null,
          company: null,
          createdAt: new Date(),
        },
      }),
    ]);

    const result = await useCaseUnderTest.execute({ cvId, userId: candidateUserId });

    expect(result.data[0].company).toBeUndefined();
    expect(result.data[0].salary).toBeNull();
  });
});
