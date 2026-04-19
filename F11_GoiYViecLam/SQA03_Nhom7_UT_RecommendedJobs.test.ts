/**
 * @file SQA03_Nhom7_UT_RecommendedJobs.test.ts
 * @module F11_GoiYViecLam
 * @description Unit tests for GetRecommendedJobsUseCase, SaveJobUseCase, UnsaveJobUseCase
 *              F11: Xem việc làm được gợi ý (Ứng viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - CANDIDATE xem danh sách việc làm được gợi ý
 *  - Không có CV chính thì trả về tin mới nhất
 *  - Non-CANDIDATE không được xem gợi ý
 *  - Lưu việc làm thành công (CANDIDATE)
 *  - Thất bại khi đã lưu rồi
 *  - Non-CANDIDATE không thể lưu
 *  - Bỏ lưu việc làm thành công
 *  - Thất bại khi bỏ lưu tin chưa lưu
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum JobStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED' }

class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}
class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class ConflictError extends Error {
  statusCode = 409;
  constructor(msg: string) { super(msg); this.name = 'ConflictError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface IJobRepository {
  findAll(opts: any): Promise<{ data: any[]; pagination: any }>;
  findByIdWithRelations(id: string): Promise<any | null>;
}
interface ICVRepository {
  findMainCVByUserId(userId: string): Promise<{ id: string } | null>;
  findByIdWithRelations(id: string): Promise<any | null>;
}
interface ISavedJobRepository {
  findByUserAndJob(userId: string, jobId: string): Promise<any | null>;
  save(savedJob: any): Promise<any>;
  deleteByUserAndJob(userId: string, jobId: string): Promise<void>;
}

class GetRecommendedJobsUseCase {
  constructor(
    private jobRepo: IJobRepository,
    private cvRepo: ICVRepository,
  ) {}

  async execute(input: { userId: string; userRole: string; limit?: number; page?: number }) {
    if (input.userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Only candidates can view recommended jobs');

    const limit = input.limit ?? 10;
    const mainCV = await this.cvRepo.findMainCVByUserId(input.userId);

    if (!mainCV) {
      const jobs = await this.jobRepo.findAll({
        page: input.page ?? 1,
        limit,
        status: JobStatus.ACTIVE,
        orderBy: { createdAt: 'desc' },
      });
      return { data: jobs.data, pagination: jobs.pagination };
    }

    const cvData = await this.cvRepo.findByIdWithRelations(mainCV.id) as any;
    const userExperienceLevel = cvData?.workExperiences?.[0]?.title ?? null;

    const filters: Record<string, unknown> = { status: JobStatus.ACTIVE };
    if (userExperienceLevel) {
      const lvl = this.mapLevel(userExperienceLevel);
      if (lvl) filters.experienceLevel = lvl;
    }

    const jobs = await this.jobRepo.findAll({
      page: input.page ?? 1,
      limit,
      ...filters,
      orderBy: { createdAt: 'desc' },
    });

    return { data: jobs.data, pagination: jobs.pagination };
  }

  private mapLevel(title: string): string | null {
    const t = title.toLowerCase();
    if (t.includes('senior') || t.includes('lead') || t.includes('manager')) return 'SENIOR';
    if (t.includes('middle') || t.includes('mid')) return 'MIDDLE';
    if (t.includes('junior')) return 'JUNIOR';
    if (t.includes('fresher') || t.includes('intern')) return 'FRESHER';
    return null;
  }
}

class SaveJobUseCase {
  constructor(
    private jobRepo: IJobRepository,
    private savedJobRepo: ISavedJobRepository,
  ) {}

  async execute(input: { userId: string; userRole: string; jobId: string }) {
    if (input.userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Only candidates can save jobs');

    const job = await this.jobRepo.findByIdWithRelations(input.jobId);
    if (!job) throw new NotFoundError('Job not found');

    const existing = await this.savedJobRepo.findByUserAndJob(input.userId, input.jobId);
    if (existing) throw new ConflictError('Job already saved');

    const saved = await this.savedJobRepo.save({
      userId: input.userId,
      jobId: input.jobId,
      createdAt: new Date(),
    });

    return { id: saved.id, jobId: saved.jobId, userId: saved.userId, createdAt: saved.createdAt, job };
  }
}

class UnsaveJobUseCase {
  constructor(private savedJobRepo: ISavedJobRepository) {}

  async execute(input: { userId: string; userRole: string; jobId: string }) {
    if (input.userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Only candidates can unsave jobs');

    const savedJob = await this.savedJobRepo.findByUserAndJob(input.userId, input.jobId);
    if (!savedJob) throw new NotFoundError('Saved job not found');

    await this.savedJobRepo.deleteByUserAndJob(input.userId, input.jobId);
    return { success: true, message: 'Bỏ lưu tin tuyển dụng thành công' };
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildJob = (overrides: any = {}) => ({
  id: 'job-001',
  title: 'Backend Developer',
  status: JobStatus.ACTIVE,
  industry: 'IT',
  experienceLevel: 'JUNIOR',
  ...overrides,
});

const buildPagination = () => ({ page: 1, limit: 10, total: 1, totalPages: 1 });

const buildSavedJob = (overrides: any = {}) => ({
  id: 'saved-001',
  userId: 'user-001',
  jobId: 'job-001',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

// =====================================================================
// TEST SUITE: GetRecommendedJobsUseCase
// =====================================================================
describe('F11 - Việc làm gợi ý | GetRecommendedJobsUseCase', () => {

  it('UT_F11_01 – CANDIDATE xem gợi ý, có CV chính với kinh nghiệm', async () => {
    /**
     * Test Case ID : UT_F11_01
     * Test Objective: Khi có CV chính, gợi ý dựa trên experienceLevel của CV
     * Input         : userId="user-001", có mainCV với workExperiences[0].title="Senior Developer"
     * Expected Output: findAll() nhận filter experienceLevel=SENIOR
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      findMainCVByUserId: jest.fn().mockResolvedValue({ id: 'cv-001' }),
      findByIdWithRelations: jest.fn().mockResolvedValue({
        workExperiences: [{ title: 'Senior Developer' }],
      }),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn().mockResolvedValue({ data: [buildJob({ experienceLevel: 'SENIOR' })], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
    };
    const useCase = new GetRecommendedJobsUseCase(jobRepo, cvRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(jobRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ experienceLevel: 'SENIOR', status: JobStatus.ACTIVE })
    );
    expect(result.data).toHaveLength(1);
  });

  it('UT_F11_02 – Không có CV chính thì trả về tin mới nhất', async () => {
    /**
     * Test Case ID : UT_F11_02
     * Test Objective: Khi ứng viên chưa có CV, trả về tin tuyển dụng mới nhất
     * Input         : findMainCVByUserId() trả về null
     * Expected Output: findAll() nhận status=ACTIVE và orderBy createdAt desc
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      findMainCVByUserId: jest.fn().mockResolvedValue(null),
      findByIdWithRelations: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn().mockResolvedValue({ data: [buildJob()], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
    };
    const useCase = new GetRecommendedJobsUseCase(jobRepo, cvRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(jobRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: JobStatus.ACTIVE })
    );
    expect(result.data).toHaveLength(1);
    // CV relations không được fetch khi không có mainCV
    expect(cvRepo.findByIdWithRelations).not.toHaveBeenCalled();
  });

  it('UT_F11_03 – Non-CANDIDATE bị từ chối truy cập gợi ý', async () => {
    /**
     * Test Case ID : UT_F11_03
     * Test Objective: RECRUITER không được xem gợi ý việc làm
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      findMainCVByUserId: jest.fn(),
      findByIdWithRelations: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn(),
      findByIdWithRelations: jest.fn(),
    };
    const useCase = new GetRecommendedJobsUseCase(jobRepo, cvRepo);

    await expect(useCase.execute({ userId: 'user-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
    expect(jobRepo.findAll).not.toHaveBeenCalled();
  });

  it('UT_F11_04 – Giới hạn kết quả theo tham số limit', async () => {
    /**
     * Test Case ID : UT_F11_04
     * Test Objective: Tham số limit được truyền đến repository
     * Input         : limit=5
     * Expected Output: findAll() nhận limit=5
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      findMainCVByUserId: jest.fn().mockResolvedValue(null),
      findByIdWithRelations: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
    };
    const useCase = new GetRecommendedJobsUseCase(jobRepo, cvRepo);

    await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, limit: 5 });

    expect(jobRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });
});

// =====================================================================
// TEST SUITE: SaveJobUseCase
// =====================================================================
describe('F11 - Lưu việc làm | SaveJobUseCase', () => {

  it('UT_F11_05 – CANDIDATE lưu việc làm thành công', async () => {
    /**
     * Test Case ID : UT_F11_05
     * Test Objective: Ứng viên lưu tin tuyển dụng hợp lệ
     * Input         : userId="user-001", userRole=CANDIDATE, jobId="job-001"
     * Expected Output: savedJobRepo.save() được gọi; trả về savedJob object
     * Notes         : CheckDB – savedJobRepo.save() phải được gọi 1 lần
     */
    const savedJob = buildSavedJob();
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(buildJob()),
    };
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(savedJob),
      deleteByUserAndJob: jest.fn(),
    };
    const useCase = new SaveJobUseCase(jobRepo, savedJobRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001' });

    expect(result.id).toBe('saved-001');
    expect(savedJobRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-001', jobId: 'job-001' })
    );
  });

  it('UT_F11_06 – Thất bại khi đã lưu tin này rồi', async () => {
    /**
     * Test Case ID : UT_F11_06
     * Test Objective: Không cho phép lưu trùng
     * Input         : findByUserAndJob() trả về savedJob đã tồn tại
     * Expected Output: ConflictError "Job already saved"
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(buildJob()),
    };
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn().mockResolvedValue(buildSavedJob()),
      save: jest.fn(),
      deleteByUserAndJob: jest.fn(),
    };
    const useCase = new SaveJobUseCase(jobRepo, savedJobRepo);

    await expect(useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001' }))
      .rejects.toThrow(ConflictError);
    expect(savedJobRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F11_07 – Non-CANDIDATE không thể lưu việc làm', async () => {
    /**
     * Test Case ID : UT_F11_07
     * Test Objective: RECRUITER bị từ chối khi cố lưu tin
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findAll: jest.fn(),
      findByIdWithRelations: jest.fn(),
    };
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn(),
      save: jest.fn(),
      deleteByUserAndJob: jest.fn(),
    };
    const useCase = new SaveJobUseCase(jobRepo, savedJobRepo);

    await expect(useCase.execute({ userId: 'user-001', userRole: UserRole.RECRUITER, jobId: 'job-001' }))
      .rejects.toThrow(AuthorizationError);
  });
});

// =====================================================================
// TEST SUITE: UnsaveJobUseCase
// =====================================================================
describe('F11 - Bỏ lưu việc làm | UnsaveJobUseCase', () => {

  it('UT_F11_08 – CANDIDATE bỏ lưu việc làm thành công', async () => {
    /**
     * Test Case ID : UT_F11_08
     * Test Objective: Ứng viên bỏ lưu tin đã lưu trước đó
     * Input         : savedJob tồn tại
     * Expected Output: deleteByUserAndJob() được gọi; trả về success=true
     * Notes         : CheckDB – deleteByUserAndJob() phải được gọi 1 lần với đúng userId và jobId
     *                 Rollback – mock; không thay đổi DB thực
     */
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn().mockResolvedValue(buildSavedJob()),
      save: jest.fn(),
      deleteByUserAndJob: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new UnsaveJobUseCase(savedJobRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001' });

    expect(result.success).toBe(true);
    expect(savedJobRepo.deleteByUserAndJob).toHaveBeenCalledWith('user-001', 'job-001');
  });

  it('UT_F11_09 – Thất bại khi bỏ lưu tin chưa được lưu', async () => {
    /**
     * Test Case ID : UT_F11_09
     * Test Objective: NotFoundError khi savedJob không tồn tại
     * Input         : findByUserAndJob() trả về null
     * Expected Output: NotFoundError "Saved job not found"
     */
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      deleteByUserAndJob: jest.fn(),
    };
    const useCase = new UnsaveJobUseCase(savedJobRepo);

    await expect(useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-999' }))
      .rejects.toThrow(NotFoundError);
    expect(savedJobRepo.deleteByUserAndJob).not.toHaveBeenCalled();
  });

  it('UT_F11_10 – Non-CANDIDATE không thể bỏ lưu', async () => {
    /**
     * Test Case ID : UT_F11_10
     * Test Objective: ADMIN bị từ chối khi cố bỏ lưu
     * Input         : userRole=ADMIN
     * Expected Output: AuthorizationError
     */
    const savedJobRepo: jest.Mocked<ISavedJobRepository> = {
      findByUserAndJob: jest.fn(),
      save: jest.fn(),
      deleteByUserAndJob: jest.fn(),
    };
    const useCase = new UnsaveJobUseCase(savedJobRepo);

    await expect(useCase.execute({ userId: 'admin-001', userRole: UserRole.ADMIN, jobId: 'job-001' }))
      .rejects.toThrow(AuthorizationError);
  });
});
