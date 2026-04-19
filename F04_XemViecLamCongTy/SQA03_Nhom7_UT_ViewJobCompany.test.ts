/**
 * @file SQA03_Nhom7_UT_ViewJobCompany.test.ts
 * @module F04_XemViecLamCongTy
 * @description Unit tests for GetJobByIdUseCase, SearchJobsUseCase, GetCompanyByIdUseCase
 *              F04: Xem việc làm & Công ty (Ứng viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Xem chi tiết công việc hợp lệ
 *  - Không tìm thấy công việc
 *  - CANDIDATE không thể xem tin bị LOCKED
 *  - ADMIN có thể xem tin bị LOCKED
 *  - Tìm kiếm việc làm theo từ khóa
 *  - Non-admin chỉ tìm kiếm tin ACTIVE
 *  - Xem chi tiết công ty
 *  - Non-admin không xem được công ty bị LOCKED
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole  { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum JobStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', CLOSED = 'CLOSED', PENDING = 'PENDING', DRAFT = 'DRAFT', INACTIVE = 'INACTIVE' }
enum UserStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', PENDING = 'PENDING' }

class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================

// --- GetJobByIdUseCase ---
interface IJobRepository { findByIdWithRelations(id: string): Promise<any | null>; }
interface IUserRepository { findByIdWithCompanyMember(id: string): Promise<any | null>; }

class GetJobByIdUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: { jobId: string; userId?: string; userRole?: string }) {
    const job = await this.jobRepository.findByIdWithRelations(input.jobId);
    if (!job) throw new NotFoundError('Job not found');

    if (job.status === JobStatus.LOCKED) {
      if (input.userRole === UserRole.ADMIN) {
        // admin được xem
      } else if (input.userRole === UserRole.RECRUITER && input.userId) {
        const user = await this.userRepository.findByIdWithCompanyMember(input.userId);
        if (!user?.companyMember?.company?.id || user.companyMember.company.id !== job.companyId)
          throw new AuthorizationError('Tin tuyển dụng đã bị khóa và không thể xem');
      } else {
        throw new AuthorizationError('Tin tuyển dụng đã bị khóa và không thể xem');
      }
    }
    return job;
  }
}

// --- SearchJobsUseCase ---
interface IJobSearchRepository { searchJobs(opts: any): Promise<{ data: any[]; pagination: any }>; }

class SearchJobsUseCase {
  constructor(private readonly jobRepository: IJobSearchRepository) {}

  async execute(input: { query?: string; location?: string; jobType?: string; experienceLevel?: string; salaryMin?: number; salaryMax?: number; status?: string; page?: number; limit?: number; userRole?: string }) {
    let statusFilter = input.status;
    if (input.userRole !== UserRole.ADMIN) {
      statusFilter = JobStatus.ACTIVE; // non-admin chỉ xem ACTIVE
    }
    const result = await this.jobRepository.searchJobs({
      keyword: input.query,
      location: input.location,
      jobType: input.jobType,
      experienceLevel: input.experienceLevel,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      status: statusFilter,
      page: input.page ?? 1,
      limit: input.limit ?? 10,
    });
    return { data: result.data, pagination: result.pagination };
  }
}

// --- GetCompanyByIdUseCase ---
interface ICompanyRepository {
  findByIdWithMembers(id: string): Promise<any | null>;
  findByIdWithoutMembers(id: string): Promise<any | null>;
}
interface ICompanyMemberRepository {
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}

class GetCompanyByIdUseCase {
  constructor(
    private readonly companyRepository: ICompanyRepository,
    private readonly companyMemberRepository: ICompanyMemberRepository,
  ) {}

  async execute(input: { companyId: string; userId?: string; userRole?: string }) {
    let isCompanyMember = false;
    if (input.userId) {
      const member = await this.companyMemberRepository.findByCompanyAndUser(input.companyId, input.userId);
      isCompanyMember = !!member;
    }
    const isAdmin = input.userRole === UserRole.ADMIN;
    const canViewMembers = isAdmin || isCompanyMember;

    const company = canViewMembers
      ? await this.companyRepository.findByIdWithMembers(input.companyId)
      : await this.companyRepository.findByIdWithoutMembers(input.companyId);

    if (!company) throw new NotFoundError('Company not found');
    if (company.status === UserStatus.LOCKED && !isAdmin)
      throw new AuthorizationError('Company is locked and cannot be viewed');

    return company;
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildJob = (overrides: any = {}) => ({
  id: 'job-001',
  title: 'Software Engineer',
  companyId: 'company-001',
  status: JobStatus.ACTIVE,
  location: 'Hà Nội',
  industry: 'IT',
  ...overrides,
});

const buildCompany = (overrides: any = {}) => ({
  id: 'company-001',
  name: 'Công ty ABC',
  status: UserStatus.ACTIVE,
  ...overrides,
});

// =====================================================================
// TEST SUITE: GetJobByIdUseCase
// =====================================================================
describe('F04 - Xem chi tiết việc làm | GetJobByIdUseCase', () => {

  it('UT_F04_01 – Xem chi tiết việc làm ACTIVE thành công', async () => {
    /**
     * Test Case ID : UT_F04_01
     * Test Objective: Bất kỳ người dùng nào cũng có thể xem tin ACTIVE
     * Input         : jobId="job-001", status=ACTIVE
     * Expected Output: Trả về thông tin job đầy đủ
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findByIdWithRelations: jest.fn().mockResolvedValue(buildJob()),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findByIdWithCompanyMember: jest.fn(),
    };
    const useCase = new GetJobByIdUseCase(jobRepo, userRepo);

    const result = await useCase.execute({ jobId: 'job-001', userRole: UserRole.CANDIDATE });
    expect(result.id).toBe('job-001');
    expect(result.status).toBe(JobStatus.ACTIVE);
  });

  it('UT_F04_02 – Trả về NotFoundError khi jobId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F04_02
     * Test Objective: Xác minh lỗi khi job không có trong DB
     * Input         : jobId="ghost-job"
     * Expected Output: NotFoundError "Job not found"
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findByIdWithRelations: jest.fn().mockResolvedValue(null),
    };
    const userRepo: jest.Mocked<IUserRepository> = { findByIdWithCompanyMember: jest.fn() };
    const useCase = new GetJobByIdUseCase(jobRepo, userRepo);

    await expect(useCase.execute({ jobId: 'ghost-job', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
  });

  it('UT_F04_03 – CANDIDATE không thể xem tin bị LOCKED', async () => {
    /**
     * Test Case ID : UT_F04_03
     * Test Objective: Phân quyền – CANDIDATE bị chặn khi tin LOCKED
     * Input         : status=LOCKED, userRole=CANDIDATE
     * Expected Output: AuthorizationError
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findByIdWithRelations: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.LOCKED })),
    };
    const userRepo: jest.Mocked<IUserRepository> = { findByIdWithCompanyMember: jest.fn() };
    const useCase = new GetJobByIdUseCase(jobRepo, userRepo);

    await expect(useCase.execute({ jobId: 'job-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F04_04 – ADMIN có thể xem tin bị LOCKED', async () => {
    /**
     * Test Case ID : UT_F04_04
     * Test Objective: Admin không bị chặn khi tin LOCKED
     * Input         : status=LOCKED, userRole=ADMIN
     * Expected Output: Trả về job bình thường
     */
    const jobRepo: jest.Mocked<IJobRepository> = {
      findByIdWithRelations: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.LOCKED })),
    };
    const userRepo: jest.Mocked<IUserRepository> = { findByIdWithCompanyMember: jest.fn() };
    const useCase = new GetJobByIdUseCase(jobRepo, userRepo);

    const result = await useCase.execute({ jobId: 'job-001', userRole: UserRole.ADMIN });
    expect(result.status).toBe(JobStatus.LOCKED);
  });
});

// =====================================================================
// TEST SUITE: SearchJobsUseCase
// =====================================================================
describe('F04 - Tìm kiếm việc làm | SearchJobsUseCase', () => {

  it('UT_F04_05 – Non-admin chỉ tìm kiếm được tin ACTIVE', async () => {
    /**
     * Test Case ID : UT_F04_05
     * Test Objective: CANDIDATE không thể nhận tin LOCKED/CLOSED trong kết quả tìm kiếm
     * Input         : userRole=CANDIDATE, status=LOCKED (truyền vào)
     * Expected Output: searchJobs() nhận status=ACTIVE (forced override)
     */
    const jobSearchRepo: jest.Mocked<IJobSearchRepository> = {
      searchJobs: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    };
    const useCase = new SearchJobsUseCase(jobSearchRepo);

    await useCase.execute({ userRole: UserRole.CANDIDATE, status: JobStatus.LOCKED as string });

    expect(jobSearchRepo.searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ status: JobStatus.ACTIVE })
    );
  });

  it('UT_F04_06 – Admin có thể tìm kiếm với bất kỳ status nào', async () => {
    /**
     * Test Case ID : UT_F04_06
     * Test Objective: Admin không bị ép status=ACTIVE
     * Input         : userRole=ADMIN, status=LOCKED
     * Expected Output: searchJobs() nhận status=LOCKED
     */
    const jobSearchRepo: jest.Mocked<IJobSearchRepository> = {
      searchJobs: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    };
    const useCase = new SearchJobsUseCase(jobSearchRepo);

    await useCase.execute({ userRole: UserRole.ADMIN, status: JobStatus.LOCKED as string });

    expect(jobSearchRepo.searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ status: JobStatus.LOCKED })
    );
  });

  it('UT_F04_07 – Tìm kiếm với từ khóa và location', async () => {
    /**
     * Test Case ID : UT_F04_07
     * Test Objective: Các tham số tìm kiếm được truyền đúng vào repository
     * Input         : query="developer", location="Hà Nội"
     * Expected Output: searchJobs() nhận keyword="developer", location="Hà Nội"
     */
    const jobSearchRepo: jest.Mocked<IJobSearchRepository> = {
      searchJobs: jest.fn().mockResolvedValue({ data: [buildJob()], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } }),
    };
    const useCase = new SearchJobsUseCase(jobSearchRepo);

    const result = await useCase.execute({ query: 'developer', location: 'Hà Nội', userRole: UserRole.CANDIDATE });

    expect(jobSearchRepo.searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'developer', location: 'Hà Nội' })
    );
    expect(result.data).toHaveLength(1);
  });
});

// =====================================================================
// TEST SUITE: GetCompanyByIdUseCase
// =====================================================================
describe('F04 - Xem thông tin công ty | GetCompanyByIdUseCase', () => {

  it('UT_F04_08 – Xem công ty ACTIVE thành công', async () => {
    /**
     * Test Case ID : UT_F04_08
     * Test Objective: Ứng viên xem được thông tin công ty ACTIVE
     * Input         : companyId="company-001", status=ACTIVE
     * Expected Output: Trả về thông tin công ty
     */
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      findByIdWithMembers: jest.fn(),
      findByIdWithoutMembers: jest.fn().mockResolvedValue(buildCompany()),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetCompanyByIdUseCase(companyRepo, memberRepo);

    const result = await useCase.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE });
    expect(result.id).toBe('company-001');
  });

  it('UT_F04_09 – Non-admin không xem được công ty LOCKED', async () => {
    /**
     * Test Case ID : UT_F04_09
     * Test Objective: Phân quyền – CANDIDATE bị chặn khi công ty LOCKED
     * Input         : company.status=LOCKED, userRole=CANDIDATE
     * Expected Output: AuthorizationError
     */
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      findByIdWithMembers: jest.fn(),
      findByIdWithoutMembers: jest.fn().mockResolvedValue(buildCompany({ status: UserStatus.LOCKED })),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetCompanyByIdUseCase(companyRepo, memberRepo);

    await expect(useCase.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F04_10 – NotFoundError khi companyId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F04_10
     * Test Objective: Xác minh lỗi khi company không có trong DB
     * Input         : companyId="ghost-company"
     * Expected Output: NotFoundError "Company not found"
     */
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      findByIdWithMembers: jest.fn(),
      findByIdWithoutMembers: jest.fn().mockResolvedValue(null),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetCompanyByIdUseCase(companyRepo, memberRepo);

    await expect(useCase.execute({ companyId: 'ghost-company' }))
      .rejects.toThrow(NotFoundError);
  });
});
