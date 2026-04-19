/**
 * Unit tests: SearchCVsUseCase
 * Use case: Nhà tuyển dụng / admin tìm kiếm CV ứng viên (`GET /api/cvs/search`).
 * Ứng viên (CANDIDATE) không được phép — ném AuthorizationError.
 */

import { SearchCVsUseCase } from '../../../src/modules/cv/application/use-cases/SearchCVsUseCase';
import type { ICVRepository } from '../../../src/modules/cv/domain/repositories/ICVRepository';
import { UserRole } from '../../../src/modules/user/domain/enums/UserRole';
import { AuthorizationError } from '../../../src/shared/domain/errors/index';
import { buildCvForSearchResult } from '../helpers/candidateSearchTestFactories';

function createMockCvRepository(): jest.Mocked<ICVRepository> {
  return {
    searchCVs: jest.fn(),
  } as unknown as jest.Mocked<ICVRepository>;
}

describe('SearchCVsUseCase', () => {
  let mockCvRepository: jest.Mocked<ICVRepository>;
  let useCaseUnderTest: SearchCVsUseCase;

  const recruiterUserId = '33333333-3333-3333-3333-333333333333';

  const emptyPagination = { page: 1, limit: 10, total: 0, totalPages: 0 };

  beforeEach(() => {
    mockCvRepository = createMockCvRepository();
    useCaseUnderTest = new SearchCVsUseCase({ cvRepository: mockCvRepository });
  });

  /**
   * SCR_UT_001
   * Mục tiêu: RECRUITER tìm kiếm thành công — repository nhận đúng filter + phân trang.
   */
  it('SCR_UT_001 should call searchCVs with filters when user is recruiter', async () => {
    const cvRow = buildCvForSearchResult();
    mockCvRepository.searchCVs.mockResolvedValue({
      data: [cvRow],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const result = await useCaseUnderTest.execute({
      userId: recruiterUserId,
      userRole: UserRole.RECRUITER,
      search: 'React',
      skills: ['React', 'Node'],
      location: 'Hà Nội',
      educationLevel: 'Đại học',
      page: 1,
      limit: 20,
    });

    expect(mockCvRepository.searchCVs).toHaveBeenCalledWith({
      search: 'React',
      skills: ['React', 'Node'],
      location: 'Hà Nội',
      educationLevel: 'Đại học',
      page: 1,
      limit: 20,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(cvRow.id);
    expect(result.data[0].title).toBe('CV Frontend Developer');
    expect(result.pagination.total).toBe(1);
  });

  /**
   * SCR_UT_002
   * Mục tiêu: ADMIN cũng được phép tìm kiếm.
   */
  it('SCR_UT_002 should allow admin to search CVs', async () => {
    mockCvRepository.searchCVs.mockResolvedValue({
      data: [],
      pagination: emptyPagination,
    });

    await useCaseUnderTest.execute({
      userId: recruiterUserId,
      userRole: UserRole.ADMIN,
      search: 'DevOps',
    });

    expect(mockCvRepository.searchCVs).toHaveBeenCalled();
  });

  /**
   * SCR_UT_003
   * Mục tiêu: CANDIDATE bị từ chối.
   */
  it('SCR_UT_003 should reject candidate role', async () => {
    await expect(
      useCaseUnderTest.execute({
        userId: recruiterUserId,
        userRole: UserRole.CANDIDATE,
        search: 'test',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mockCvRepository.searchCVs).not.toHaveBeenCalled();
  });

  /**
   * SCR_UT_004
   * Mục tiêu: Mặc định page=1, limit=10 khi không truyền.
   */
  it('SCR_UT_004 should default page and limit when omitted', async () => {
    mockCvRepository.searchCVs.mockResolvedValue({
      data: [],
      pagination: emptyPagination,
    });

    await useCaseUnderTest.execute({
      userId: recruiterUserId,
      userRole: UserRole.RECRUITER,
    });

    expect(mockCvRepository.searchCVs).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  /**
   * SCR_UT_005
   * Mục tiêu: Kết quả rỗng — trả về data rỗng và pagination từ repository.
   */
  it('SCR_UT_005 should return empty data when repository has no rows', async () => {
    mockCvRepository.searchCVs.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 15, total: 0, totalPages: 0 },
    });

    const result = await useCaseUnderTest.execute({
      userId: recruiterUserId,
      userRole: UserRole.RECRUITER,
      page: 2,
      limit: 15,
    });

    expect(result.data).toEqual([]);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(15);
  });
});
