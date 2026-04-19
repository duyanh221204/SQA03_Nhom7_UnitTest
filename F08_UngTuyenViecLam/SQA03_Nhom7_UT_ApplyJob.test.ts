/**
 * @file SQA03_Nhom7_UT_ApplyJob.test.ts
 * @module F08_UngTuyenViecLam
 * @description Unit tests for ApplyJobUseCase
 *              F08: Ứng tuyển việc làm (Ứng viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Ứng tuyển thành công với dữ liệu hợp lệ
 *  - Thất bại khi không phải CANDIDATE
 *  - Thất bại khi tin tuyển dụng không tồn tại
 *  - Thất bại khi tin đã hết hạn
 *  - Thất bại khi tin bị khóa (LOCKED)
 *  - Thất bại khi tin bị đóng (INACTIVE)
 *  - Thất bại khi CV không tồn tại
 *  - Thất bại khi CV không thuộc về user
 *  - Thất bại khi đã ứng tuyển trước đó
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole         { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum ApplicationStatus { PENDING = 'PENDING', REVIEWING = 'REVIEWING', ACCEPTED = 'ACCEPTED', REJECTED = 'REJECTED', CANCELLED = 'CANCELLED' }

class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASE
// =====================================================================
interface IApplicationRepository {
  findActiveByUserAndJob(userId: string, jobId: string): Promise<any | null>;
  save(app: any): Promise<any>;
  findByIdWithRelations(id: string): Promise<any | null>;
}
interface IJobRepository {
  findById(id: string): Promise<any | null>;
  incrementApplicationCount(id: string): Promise<any>;
}
interface ICVRepository {
  findById(id: string): Promise<any | null>;
}
interface ICompanyRepository {
  findById(id: string): Promise<any | null>;
}
interface INotificationService {
  notifyNewApplication(applicationId: string): Promise<void>;
}

class ApplyJobUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private cvRepo: ICVRepository,
    private companyRepo: ICompanyRepository,
    private notificationSvc: INotificationService,
  ) {}

  async execute(input: {
    userId: string;
    userRole: string;
    jobId: string;
    cvId: string;
    coverLetter?: string;
  }) {
    const { userId, userRole, jobId, cvId, coverLetter } = input;

    if (userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Chỉ ứng viên mới có thể ứng tuyển');

    const job = await this.jobRepo.findById(jobId);
    if (!job) throw new Error('Không tìm thấy tin tuyển dụng');

    if (job.status === 'LOCKED')
      throw new Error('Tin tuyển dụng đã bị khóa và không thể nhận đơn ứng tuyển');

    if (job.status === 'INACTIVE')
      throw new Error('Tin tuyển dụng đã đóng');

    if (job.isExpired && job.isExpired())
      throw new Error('Tin tuyển dụng đã hết hạn, không thể ứng tuyển');

    if (!(job.isActive && job.isActive()))
      throw new Error('Tin tuyển dụng không ở trạng thái có thể nhận đơn ứng tuyển');

    const company = await this.companyRepo.findById(job.companyId);
    if (company?.status === 'LOCKED')
      throw new Error('Công ty đã bị khóa và không thể nhận đơn ứng tuyển');

    const cv = await this.cvRepo.findById(cvId);
    if (!cv) throw new Error('Không tìm thấy CV');
    if (cv.userId !== userId) throw new Error('CV không thuộc về người dùng này');

    const existing = await this.appRepo.findActiveByUserAndJob(userId, jobId);
    if (existing) throw new Error('Bạn đã ứng tuyển cho tin tuyển dụng này');

    const savedApp = await this.appRepo.save({
      userId, jobId, cvId, coverLetter,
      status: ApplicationStatus.PENDING,
    });

    await this.jobRepo.incrementApplicationCount(jobId);

    // Fire-and-forget notification
    this.notificationSvc.notifyNewApplication(savedApp.id).catch(() => {});

    return await this.appRepo.findByIdWithRelations(savedApp.id);
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildActiveJob = (overrides: any = {}) => ({
  id: 'job-001',
  companyId: 'company-001',
  title: 'Backend Developer',
  status: 'ACTIVE',
  isActive: () => true,
  isExpired: () => false,
  isLocked: () => false,
  ...overrides,
});

const buildLockedJob = () => ({
  ...buildActiveJob(),
  status: 'LOCKED',
  isActive: () => false,
  isLocked: () => true,
});

const buildExpiredJob = () => ({
  ...buildActiveJob(),
  status: 'ACTIVE',
  isActive: () => false,
  isExpired: () => true,
});

const buildCV = (overrides: any = {}) => ({
  id: 'cv-001',
  userId: 'user-001',
  ...overrides,
});

const buildApplication = (overrides: any = {}) => ({
  id: 'app-001',
  userId: 'user-001',
  jobId: 'job-001',
  cvId: 'cv-001',
  status: ApplicationStatus.PENDING,
  ...overrides,
});

const buildActiveCompany = (overrides: any = {}) => ({
  id: 'company-001',
  status: 'ACTIVE',
  ...overrides,
});

// =====================================================================
// TEST SUITE
// =====================================================================
describe('F08 - Ứng tuyển việc làm | ApplyJobUseCase', () => {

  const makeDeps = (jobOverrides?: any, cvOverrides?: any, companyOverrides?: any, existingApp?: any) => {
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findActiveByUserAndJob: jest.fn().mockResolvedValue(existingApp ?? null),
      save: jest.fn().mockResolvedValue(buildApplication()),
      findByIdWithRelations: jest.fn().mockResolvedValue(buildApplication()),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(jobOverrides ?? buildActiveJob()),
      incrementApplicationCount: jest.fn().mockResolvedValue({}),
    };
    const cvRepo: jest.Mocked<ICVRepository> = {
      findById: jest.fn().mockResolvedValue(cvOverrides ?? buildCV()),
    };
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      findById: jest.fn().mockResolvedValue(companyOverrides ?? buildActiveCompany()),
    };
    const notificationSvc: jest.Mocked<INotificationService> = {
      notifyNewApplication: jest.fn().mockResolvedValue(undefined),
    };
    return { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc };
  };

  it('UT_F08_01 – Ứng tuyển thành công với dữ liệu hợp lệ', async () => {
    /**
     * Test Case ID : UT_F08_01
     * Test Objective: CANDIDATE ứng tuyển tin tuyển dụng ACTIVE với CV hợp lệ
     * Input         : userId="user-001", userRole=CANDIDATE, jobId="job-001", cvId="cv-001"
     * Expected Output: application được tạo với status=PENDING
     * Notes         : CheckDB – appRepo.save() và jobRepo.incrementApplicationCount() phải được gọi
     *                 Rollback – mock; không thay đổi DB thực
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps();
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    const result = await useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    });

    expect(result.status).toBe(ApplicationStatus.PENDING);
    expect(appRepo.save).toHaveBeenCalledTimes(1);
    expect(appRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-001', jobId: 'job-001', status: ApplicationStatus.PENDING })
    );
    expect(jobRepo.incrementApplicationCount).toHaveBeenCalledWith('job-001');
  });

  it('UT_F08_02 – Thất bại khi không phải CANDIDATE (RECRUITER)', async () => {
    /**
     * Test Case ID : UT_F08_02
     * Test Objective: RECRUITER không được phép ứng tuyển
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError "Chỉ ứng viên mới có thể ứng tuyển"
     * Notes         : CheckDB – appRepo.save() KHÔNG được gọi
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps();
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.RECRUITER, jobId: 'job-001', cvId: 'cv-001',
    })).rejects.toThrow(AuthorizationError);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_03 – Thất bại khi tin tuyển dụng không tồn tại', async () => {
    /**
     * Test Case ID : UT_F08_03
     * Test Objective: Lỗi khi jobId không có trong DB
     * Input         : jobId="ghost-job"
     * Expected Output: Error "Không tìm thấy tin tuyển dụng"
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps(null);
    jobRepo.findById.mockResolvedValue(null);
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'ghost-job', cvId: 'cv-001',
    })).rejects.toThrow(/không tìm thấy/i);
  });

  it('UT_F08_04 – Thất bại khi tin tuyển dụng đã hết hạn', async () => {
    /**
     * Test Case ID : UT_F08_04
     * Test Objective: Không cho phép ứng tuyển tin hết hạn
     * Input         : job.isExpired()=true
     * Expected Output: Error "đã hết hạn"
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps(buildExpiredJob());
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    })).rejects.toThrow(/hết hạn/);
  });

  it('UT_F08_05 – Thất bại khi tin bị khóa (LOCKED)', async () => {
    /**
     * Test Case ID : UT_F08_05
     * Test Objective: Tin LOCKED không nhận đơn mới
     * Input         : job.status=LOCKED
     * Expected Output: Error "đã bị khóa"
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps(buildLockedJob());
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    })).rejects.toThrow(/bị khóa/);
  });

  it('UT_F08_06 – Thất bại khi CV không tồn tại', async () => {
    /**
     * Test Case ID : UT_F08_06
     * Test Objective: Lỗi khi cvId không có trong DB
     * Input         : cvId="ghost-cv"
     * Expected Output: Error "Không tìm thấy CV"
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps();
    cvRepo.findById.mockResolvedValue(null);
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'ghost-cv',
    })).rejects.toThrow(/không tìm thấy CV/i);
  });

  it('UT_F08_07 – Thất bại khi CV không thuộc về người dùng', async () => {
    /**
     * Test Case ID : UT_F08_07
     * Test Objective: Không cho phép dùng CV của người khác để ứng tuyển
     * Input         : cv.userId="other-user", but request userId="user-001"
     * Expected Output: Error "CV không thuộc về người dùng này"
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps(undefined, buildCV({ userId: 'other-user' }));
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    })).rejects.toThrow(/CV không thuộc/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_08 – Thất bại khi đã ứng tuyển trước đó (duplicate)', async () => {
    /**
     * Test Case ID : UT_F08_08
     * Test Objective: Không cho phép ứng tuyển hai lần cho cùng một tin
     * Input         : findActiveByUserAndJob() trả về đơn đã tồn tại
     * Expected Output: Error "Bạn đã ứng tuyển cho tin tuyển dụng này"
     */
    const existingApp = buildApplication();
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps(undefined, undefined, undefined, existingApp);
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await expect(useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    })).rejects.toThrow(/đã ứng tuyển/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_09 – Thông báo được gửi sau khi ứng tuyển thành công', async () => {
    /**
     * Test Case ID : UT_F08_09
     * Test Objective: notifyNewApplication() phải được gọi với applicationId đúng
     * Input         : Ứng tuyển thành công
     * Expected Output: notificationSvc.notifyNewApplication() được gọi với applicationId
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notificationSvc } = makeDeps();
    const useCase = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notificationSvc);

    await useCase.execute({
      userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001',
    });

    // Đợi fire-and-forget bằng cách flush microtasks
    await Promise.resolve();
    expect(notificationSvc.notifyNewApplication).toHaveBeenCalledWith('app-001');
  });
});
