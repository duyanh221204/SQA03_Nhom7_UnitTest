/**
 * @file SQA03_Nhom7_UT_SearchCV.test.ts
 * @module F10_TimKiemCV
 * @description Unit tests for SearchCVsUseCase & GetRecommendedCVsForJobUseCase
 *              F10: Tìm kiếm CV ứng viên (Nhà tuyển dụng)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - RECRUITER tìm kiếm CV thành công
 *  - ADMIN tìm kiếm CV thành công
 *  - CANDIDATE không được tìm kiếm CV
 *  - Tìm kiếm với bộ lọc skills/location
 *  - Phân trang mặc định
 *  - GetRecommendedCVsForJob: RECRUITER lấy CV gợi ý cho tin tuyển dụng
 *  - GetRecommendedCVsForJob: Thất bại khi không phải RECRUITER/ADMIN
 *  - GetRecommendedCVsForJob: Thất bại khi job không tồn tại
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}
class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface ICVRepository {
  searchCVs(opts: any): Promise<{ data: any[]; pagination: any }>;
  findRecommendedForJob(opts: any): Promise<any[]>;
}
interface IJobRepository {
  findById(id: string): Promise<any | null>;
}

class SearchCVsUseCase {
  constructor(private cvRepo: ICVRepository) {}

  async execute(input: {
    userRole: string;
    search?: string;
    skills?: string[];
    location?: string;
    educationLevel?: string;
    page?: number;
    limit?: number;
  }) {
    const isAdmin = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;

    if (!isAdmin && !isRecruiter)
      throw new AuthorizationError('Chỉ quản trị viên và nhà tuyển dụng mới có thể tìm kiếm CV');

    const page = input.page ?? 1;
    const limit = input.limit ?? 10;

    const result = await this.cvRepo.searchCVs({
      search: input.search,
      skills: input.skills,
      location: input.location,
      educationLevel: input.educationLevel,
      page,
      limit,
    });

    return { data: result.data, pagination: result.pagination };
  }
}

class GetRecommendedCVsForJobUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private jobRepo: IJobRepository,
  ) {}

  async execute(input: { userRole: string; jobId: string; limit?: number }) {
    if (input.userRole !== UserRole.RECRUITER && input.userRole !== UserRole.ADMIN)
      throw new AuthorizationError('Chỉ nhà tuyển dụng và quản trị viên mới có thể xem CV gợi ý');

    const job = await this.jobRepo.findById(input.jobId);
    if (!job) throw new NotFoundError('Không tìm thấy việc làm');

    const limit = input.limit ?? 10;

    const cvs = await this.cvRepo.findRecommendedForJob({
      industry: job.industry,
      experienceLevel: job.experienceLevel,
      limit,
    });

    return { data: cvs };
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildCV = (overrides: any = {}) => ({
  id: 'cv-001',
  title: 'Backend Developer CV',
  fullName: 'Nguyễn Văn A',
  skills: [{ skillName: 'Node.js', level: 'INTERMEDIATE' }],
  workExperiences: [],
  educations: [],
  ...overrides,
});

const buildJob = (overrides: any = {}) => ({
  id: 'job-001',
  title: 'Backend Developer',
  industry: 'IT',
  experienceLevel: 'JUNIOR',
  ...overrides,
});

const buildPagination = (overrides: any = {}) => ({
  page: 1, limit: 10, total: 1, totalPages: 1, ...overrides,
});

// =====================================================================
// TEST SUITE: SearchCVsUseCase
// =====================================================================
describe('F10 - Tìm kiếm CV ứng viên | SearchCVsUseCase', () => {

  it('UT_F10_01 – RECRUITER tìm kiếm CV thành công', async () => {
    /**
     * Test Case ID : UT_F10_01
     * Test Objective: Nhà tuyển dụng có thể tìm kiếm CV ứng viên
     * Input         : userRole=RECRUITER, search="Node.js"
     * Expected Output: Danh sách CV trả về
     * Notes         : CheckDB – searchCVs() phải được gọi 1 lần
     */
    const cvs = [buildCV()];
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn().mockResolvedValue({ data: cvs, pagination: buildPagination() }),
      findRecommendedForJob: jest.fn(),
    };
    const useCase = new SearchCVsUseCase(cvRepo);

    const result = await useCase.execute({ userRole: UserRole.RECRUITER, search: 'Node.js' });

    expect(result.data).toHaveLength(1);
    expect(cvRepo.searchCVs).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Node.js' })
    );
  });

  it('UT_F10_02 – ADMIN tìm kiếm CV thành công', async () => {
    /**
     * Test Case ID : UT_F10_02
     * Test Objective: Admin có thể tìm kiếm CV
     * Input         : userRole=ADMIN
     * Expected Output: Danh sách CV trả về
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn().mockResolvedValue({ data: [buildCV()], pagination: buildPagination() }),
      findRecommendedForJob: jest.fn(),
    };
    const useCase = new SearchCVsUseCase(cvRepo);

    const result = await useCase.execute({ userRole: UserRole.ADMIN });
    expect(result.data).toHaveLength(1);
  });

  it('UT_F10_03 – CANDIDATE không thể tìm kiếm CV', async () => {
    /**
     * Test Case ID : UT_F10_03
     * Test Objective: CANDIDATE bị từ chối khi cố tìm kiếm CV
     * Input         : userRole=CANDIDATE
     * Expected Output: AuthorizationError
     * Notes         : CheckDB – searchCVs() KHÔNG được gọi
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn(),
      findRecommendedForJob: jest.fn(),
    };
    const useCase = new SearchCVsUseCase(cvRepo);

    await expect(useCase.execute({ userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
    expect(cvRepo.searchCVs).not.toHaveBeenCalled();
  });

  it('UT_F10_04 – Tìm kiếm với bộ lọc skills và location', async () => {
    /**
     * Test Case ID : UT_F10_04
     * Test Objective: Bộ lọc skills và location được truyền đến repository
     * Input         : skills=["React", "TypeScript"], location="Hà Nội"
     * Expected Output: searchCVs() nhận đúng các tham số lọc
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination({ total: 0 }) }),
      findRecommendedForJob: jest.fn(),
    };
    const useCase = new SearchCVsUseCase(cvRepo);

    await useCase.execute({
      userRole: UserRole.RECRUITER,
      skills: ['React', 'TypeScript'],
      location: 'Hà Nội',
    });

    expect(cvRepo.searchCVs).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ['React', 'TypeScript'], location: 'Hà Nội' })
    );
  });

  it('UT_F10_05 – Phân trang mặc định page=1 limit=10', async () => {
    /**
     * Test Case ID : UT_F10_05
     * Test Objective: Giá trị phân trang mặc định được áp dụng
     * Input         : không truyền page/limit
     * Expected Output: searchCVs() nhận page=1, limit=10
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findRecommendedForJob: jest.fn(),
    };
    const useCase = new SearchCVsUseCase(cvRepo);

    await useCase.execute({ userRole: UserRole.RECRUITER });

    expect(cvRepo.searchCVs).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 })
    );
  });
});

// =====================================================================
// TEST SUITE: GetRecommendedCVsForJobUseCase
// =====================================================================
describe('F10 - CV gợi ý cho tin tuyển dụng | GetRecommendedCVsForJobUseCase', () => {

  it('UT_F10_06 – RECRUITER lấy CV gợi ý cho tin tuyển dụng thành công', async () => {
    /**
     * Test Case ID : UT_F10_06
     * Test Objective: Nhà tuyển dụng lấy CV phù hợp với tin tuyển dụng
     * Input         : userRole=RECRUITER, jobId="job-001"
     * Expected Output: Danh sách CV được gợi ý theo industry và experienceLevel của job
     */
    const cvs = [buildCV()];
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn(),
      findRecommendedForJob: jest.fn().mockResolvedValue(cvs),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const useCase = new GetRecommendedCVsForJobUseCase(cvRepo, jobRepo);

    const result = await useCase.execute({ userRole: UserRole.RECRUITER, jobId: 'job-001' });

    expect(result.data).toHaveLength(1);
    expect(cvRepo.findRecommendedForJob).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'IT', experienceLevel: 'JUNIOR' })
    );
  });

  it('UT_F10_07 – Thất bại khi CANDIDATE cố lấy CV gợi ý', async () => {
    /**
     * Test Case ID : UT_F10_07
     * Test Objective: CANDIDATE không có quyền xem CV gợi ý
     * Input         : userRole=CANDIDATE
     * Expected Output: AuthorizationError
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn(),
      findRecommendedForJob: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn() };
    const useCase = new GetRecommendedCVsForJobUseCase(cvRepo, jobRepo);

    await expect(useCase.execute({ userRole: UserRole.CANDIDATE, jobId: 'job-001' }))
      .rejects.toThrow(AuthorizationError);
    expect(jobRepo.findById).not.toHaveBeenCalled();
  });

  it('UT_F10_08 – Thất bại khi jobId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F10_08
     * Test Objective: NotFoundError khi tin tuyển dụng không có trong DB
     * Input         : jobId="ghost-job"
     * Expected Output: NotFoundError
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn(),
      findRecommendedForJob: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetRecommendedCVsForJobUseCase(cvRepo, jobRepo);

    await expect(useCase.execute({ userRole: UserRole.RECRUITER, jobId: 'ghost-job' }))
      .rejects.toThrow(NotFoundError);
    expect(cvRepo.findRecommendedForJob).not.toHaveBeenCalled();
  });

  it('UT_F10_09 – Limit mặc định là 10 khi không truyền', async () => {
    /**
     * Test Case ID : UT_F10_09
     * Test Objective: Giá trị limit mặc định được áp dụng
     * Input         : không truyền limit
     * Expected Output: findRecommendedForJob() nhận limit=10
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      searchCVs: jest.fn(),
      findRecommendedForJob: jest.fn().mockResolvedValue([]),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const useCase = new GetRecommendedCVsForJobUseCase(cvRepo, jobRepo);

    await useCase.execute({ userRole: UserRole.RECRUITER, jobId: 'job-001' });

    expect(cvRepo.findRecommendedForJob).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 })
    );
  });
});
