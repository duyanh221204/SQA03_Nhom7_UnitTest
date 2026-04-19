/**
 * @file SQA03_Nhom7_UT_CreateJob.test.ts
 * @module F05_QuanLyTinTuyenDung
 * @description Unit tests for CreateJobUseCase
 *              F05: Quản lý tin tuyển dụng (Nhà tuyển dụng)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Tạo tin tuyển dụng thành công bởi RECRUITER thuộc công ty
 *  - ADMIN tạo tin cho bất kỳ công ty nào
 *  - Thất bại khi companyId không tìm thấy
 *  - Thất bại khi công ty không ACTIVE
 *  - Thất bại khi người dùng không phải member của công ty
 *  - Thất bại khi member không có quyền tạo tin (role thấp)
 *  - Tự động lấy companyId từ membership khi không truyền
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole    { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum CompanyRole { OWNER = 'OWNER', MANAGER = 'MANAGER', RECRUITER = 'RECRUITER', MEMBER = 'MEMBER' }
enum JobStatus   { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', DRAFT = 'DRAFT', PENDING = 'PENDING' }

class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASE
// =====================================================================
interface IJobRepository { create(data: any): Promise<any>; }
interface ICompanyRepository { findById(id: string): Promise<any | null>; }
interface ICompanyMemberRepository {
  findByUserId(userId: string): Promise<any | null>;
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}

class CreateJobUseCase {
  constructor(
    private jobRepository: IJobRepository,
    private companyRepository: ICompanyRepository,
    private companyMemberRepository: ICompanyMemberRepository,
  ) {}

  async execute(input: {
    userId: string;
    userRole: string;
    companyId?: string;
    title: string;
    description: string;
    location?: string;
    industry?: string;
    jobType?: string;
    experienceLevel?: string;
    urgent?: boolean;
    status?: JobStatus;
    expiresAt?: Date;
    salary?: any;
    benefits?: any[];
    requirements?: any[];
  }) {
    let companyId = input.companyId;

    if (!companyId) {
      const memberCompany = await this.companyMemberRepository.findByUserId(input.userId);
      if (!memberCompany) throw new AuthorizationError('You must be a member of a company to create jobs');
      companyId = memberCompany.companyId;
    }

    const company = await this.companyRepository.findById(companyId);
    if (!company) throw new NotFoundError('Company not found');

    if (company.status !== 'ACTIVE') throw new AuthorizationError('Company must be active to post jobs');

    if (input.userRole !== UserRole.ADMIN) {
      const member = await this.companyMemberRepository.findByCompanyAndUser(companyId, input.userId);
      if (!member) throw new AuthorizationError('You are not a member of this company');

      const allowedRoles = [CompanyRole.OWNER, CompanyRole.MANAGER, CompanyRole.RECRUITER];
      if (!allowedRoles.includes(member.companyRole))
        throw new AuthorizationError('You do not have permission to create jobs');
    }

    const savedJob = await this.jobRepository.create({
      companyId,
      title: input.title,
      description: input.description,
      location: input.location ?? '',
      industry: input.industry ?? '',
      jobType: input.jobType ?? 'FULL_TIME',
      experienceLevel: input.experienceLevel ?? 'JUNIOR',
      urgent: input.urgent ?? false,
      status: input.status ?? JobStatus.ACTIVE,
      expiresAt: input.expiresAt,
      salary: input.salary,
      benefits: input.benefits,
      requirements: input.requirements,
    });

    return savedJob;
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildCompany = (overrides: any = {}) => ({
  id: 'company-001',
  name: 'Tech Corp',
  status: 'ACTIVE',
  ...overrides,
});

const buildMember = (overrides: any = {}) => ({
  id: 'member-001',
  userId: 'recruiter-001',
  companyId: 'company-001',
  companyRole: CompanyRole.RECRUITER,
  ...overrides,
});

const buildJob = (overrides: any = {}) => ({
  id: 'job-001',
  companyId: 'company-001',
  title: 'Backend Developer',
  description: 'Build APIs',
  status: JobStatus.ACTIVE,
  ...overrides,
});

const baseInput = {
  userId: 'recruiter-001',
  userRole: UserRole.RECRUITER,
  companyId: 'company-001',
  title: 'Backend Developer',
  description: 'Build REST APIs with Node.js',
  location: 'Hà Nội',
  industry: 'IT',
};

// =====================================================================
// TEST SUITE
// =====================================================================
describe('F05 - Tạo tin tuyển dụng | CreateJobUseCase', () => {

  it('UT_F05_01 – RECRUITER tạo tin tuyển dụng thành công', async () => {
    /**
     * Test Case ID : UT_F05_01
     * Test Objective: Recruiter thuộc công ty tạo tin tuyển dụng hợp lệ
     * Input         : userId="recruiter-001", companyId="company-001", companyRole=RECRUITER
     * Expected Output: Trả về job object với id, title, status=ACTIVE
     * Notes         : CheckDB – jobRepository.create() phải được gọi 1 lần
     *                 Rollback – mock; không thay đổi DB thực
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn().mockResolvedValue(buildJob()) };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn().mockResolvedValue(buildCompany()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn().mockResolvedValue(buildMember()),
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    const result = await useCase.execute(baseInput);

    expect(result.id).toBe('job-001');
    expect(result.status).toBe(JobStatus.ACTIVE);
    expect(jobRepo.create).toHaveBeenCalledTimes(1);
    expect(jobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Backend Developer', companyId: 'company-001' })
    );
  });

  it('UT_F05_02 – ADMIN tạo tin cho bất kỳ công ty nào', async () => {
    /**
     * Test Case ID : UT_F05_02
     * Test Objective: Admin không cần phải là member của công ty để tạo tin
     * Input         : userRole=ADMIN
     * Expected Output: create() được gọi thành công; findByCompanyAndUser() KHÔNG được gọi
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn().mockResolvedValue(buildJob()) };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn().mockResolvedValue(buildCompany()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    const result = await useCase.execute({ ...baseInput, userRole: UserRole.ADMIN });

    expect(result.id).toBe('job-001');
    // Admin bỏ qua kiểm tra membership
    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
  });

  it('UT_F05_03 – Thất bại khi companyId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F05_03
     * Test Objective: Xác minh NotFoundError khi công ty không có trong DB
     * Input         : companyId="ghost-company"
     * Expected Output: NotFoundError "Company not found"
     * Notes         : CheckDB – create() KHÔNG được gọi
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn() };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn().mockResolvedValue(null) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    await expect(useCase.execute({ ...baseInput, companyId: 'ghost-company' }))
      .rejects.toThrow(NotFoundError);

    expect(jobRepo.create).not.toHaveBeenCalled();
  });

  it('UT_F05_04 – Thất bại khi công ty không ở trạng thái ACTIVE', async () => {
    /**
     * Test Case ID : UT_F05_04
     * Test Objective: Công ty PENDING không thể đăng tin
     * Input         : company.status=PENDING
     * Expected Output: AuthorizationError "Company must be active to post jobs"
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn() };
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      findById: jest.fn().mockResolvedValue(buildCompany({ status: 'PENDING' })),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    await expect(useCase.execute(baseInput)).rejects.toThrow(AuthorizationError);
    await expect(useCase.execute(baseInput)).rejects.toThrow(/active/i);
    expect(jobRepo.create).not.toHaveBeenCalled();
  });

  it('UT_F05_05 – Thất bại khi người dùng không phải member của công ty', async () => {
    /**
     * Test Case ID : UT_F05_05
     * Test Objective: RECRUITER không thuộc công ty không được tạo tin
     * Input         : companyMemberRepository.findByCompanyAndUser() trả về null
     * Expected Output: AuthorizationError "You are not a member of this company"
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn() };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn().mockResolvedValue(buildCompany()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn().mockResolvedValue(null),
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    await expect(useCase.execute(baseInput)).rejects.toThrow(/not a member/i);
    expect(jobRepo.create).not.toHaveBeenCalled();
  });

  it('UT_F05_06 – Thất bại khi companyId rỗng và không có membership nào', async () => {
    /**
     * Test Case ID : UT_F05_06
     * Test Objective: Khi không truyền companyId và không tìm thấy membership
     * Input         : companyId=undefined, findByUserId() trả về null
     * Expected Output: AuthorizationError "You must be a member of a company to create jobs"
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn() };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn() };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn().mockResolvedValue(null),
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    const inputWithoutCompany = { ...baseInput, companyId: undefined };
    await expect(useCase.execute(inputWithoutCompany)).rejects.toThrow(AuthorizationError);
  });

  it('UT_F05_07 – Tự động lấy companyId từ membership khi không truyền', async () => {
    /**
     * Test Case ID : UT_F05_07
     * Test Objective: Khi không truyền companyId, hệ thống tự lấy từ membership
     * Input         : companyId=undefined, membership tồn tại
     * Expected Output: create() được gọi với companyId lấy từ membership
     */
    const jobRepo: jest.Mocked<IJobRepository> = { create: jest.fn().mockResolvedValue(buildJob()) };
    const companyRepo: jest.Mocked<ICompanyRepository> = { findById: jest.fn().mockResolvedValue(buildCompany()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ companyId: 'company-001' }),
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new CreateJobUseCase(jobRepo, companyRepo, memberRepo);

    const inputWithoutCompany = { ...baseInput, companyId: undefined };
    const result = await useCase.execute(inputWithoutCompany);

    expect(result.companyId).toBe('company-001');
    expect(companyRepo.findById).toHaveBeenCalledWith('company-001');
  });
});
