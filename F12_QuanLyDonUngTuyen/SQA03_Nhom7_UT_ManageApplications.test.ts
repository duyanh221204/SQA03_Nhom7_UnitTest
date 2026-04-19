/**
 * @file SQA03_Nhom7_UT_ManageApplications.test.ts
 * @module F12_QuanLyDonUngTuyen
 * @description Unit tests for GetApplicationsByJobUseCase & UpdateApplicationStatusUseCase
 *              F12: Quản lý đơn ứng tuyển (Nhà tuyển dụng)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - RECRUITER thuộc công ty xem danh sách đơn theo job
 *  - ADMIN xem tất cả đơn
 *  - Non-member không xem được đơn
 *  - Thất bại khi job không tồn tại
 *  - Cập nhật trạng thái đơn hợp lệ (PENDING → REVIEWING)
 *  - Cập nhật trạng thái không hợp lệ (ACCEPTED → REJECTED)
 *  - Non-RECRUITER/ADMIN không được cập nhật trạng thái
 *  - Không phải member của công ty sở hữu job không được cập nhật
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

enum ApplicationStatus {
  PENDING   = 'PENDING',
  REVIEWING = 'REVIEWING',
  ACCEPTED  = 'ACCEPTED',
  REJECTED  = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

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
interface IApplicationRepository {
  findByJobId(jobId: string, opts: any): Promise<{ data: any[]; pagination: any }>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}
interface IJobRepository {
  findById(id: string): Promise<any | null>;
}
interface ICompanyMemberRepository {
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}

class GetApplicationsByJobUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}

  async execute(input: {
    jobId: string;
    userId: string;
    userRole: string;
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const job = await this.jobRepo.findById(input.jobId);
    if (!job) throw new Error('Job not found');

    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isAdmin) {
      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, input.userId);
      if (!member)
        throw new AuthorizationError('You do not have permission to view applications for this job');
    }

    const result = await this.appRepo.findByJobId(input.jobId, {
      page: input.page ?? 1,
      limit: input.limit ?? 10,
      status: input.status,
      includeRelations: true,
    });

    return { data: result.data, pagination: result.pagination };
  }
}

class UpdateApplicationStatusUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}

  private isValidTransition(current: ApplicationStatus, next: ApplicationStatus): boolean {
    const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      [ApplicationStatus.PENDING]:   [ApplicationStatus.REVIEWING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.REVIEWING]: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.ACCEPTED]:  [],
      [ApplicationStatus.REJECTED]:  [],
      [ApplicationStatus.CANCELLED]: [],
    };
    return transitions[current]?.includes(next) ?? false;
  }

  async execute(input: {
    applicationId: string;
    userId: string;
    userRole: string;
    status: ApplicationStatus;
    notes?: string;
  }) {
    const application = await this.appRepo.findByIdWithRelations(input.applicationId);
    if (!application) throw new NotFoundError('Application not found');

    const isAdmin = input.userRole === UserRole.ADMIN;

    if (!isAdmin) {
      if (input.userRole !== UserRole.RECRUITER)
        throw new AuthorizationError('Only recruiters and admins can update application status');

      const job = await this.jobRepo.findById(application.jobId);
      if (!job) throw new NotFoundError('Job not found');

      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, input.userId);
      if (!member)
        throw new AuthorizationError('You must be a member of the company that owns this job');
    }

    if (!this.isValidTransition(application.status, input.status))
      throw new Error(`Invalid status transition from ${application.status} to ${input.status}`);

    const updated = await this.appRepo.update(input.applicationId, {
      status: input.status,
      notes: input.notes,
    });

    return await this.appRepo.findByIdWithRelations(updated.id);
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildApplication = (overrides: any = {}) => ({
  id: 'app-001',
  userId: 'candidate-001',
  jobId: 'job-001',
  cvId: 'cv-001',
  status: ApplicationStatus.PENDING,
  notes: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

const buildJob = (overrides: any = {}) => ({
  id: 'job-001',
  companyId: 'company-001',
  title: 'Backend Dev',
  ...overrides,
});

const buildMember = (overrides: any = {}) => ({
  id: 'member-001',
  userId: 'recruiter-001',
  companyId: 'company-001',
  companyRole: 'RECRUITER',
  ...overrides,
});

const buildPagination = () => ({ page: 1, limit: 10, total: 1, totalPages: 1 });

// =====================================================================
// TEST SUITE: GetApplicationsByJobUseCase
// =====================================================================
describe('F12 - Xem danh sách đơn ứng tuyển theo job | GetApplicationsByJobUseCase', () => {

  it('UT_F12_01 – RECRUITER thuộc công ty xem đơn thành công', async () => {
    /**
     * Test Case ID : UT_F12_01
     * Test Objective: Company member (RECRUITER) có thể xem đơn của job thuộc công ty
     * Input         : userId="recruiter-001", userRole=RECRUITER, jobId="job-001"
     * Expected Output: Danh sách đơn trả về
     * Notes         : CheckDB – findByJobId() phải được gọi 1 lần
     */
    const apps = [buildApplication()];
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn().mockResolvedValue({ data: apps, pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    const result = await useCase.execute({ jobId: 'job-001', userId: 'recruiter-001', userRole: UserRole.RECRUITER });

    expect(result.data).toHaveLength(1);
    expect(appRepo.findByJobId).toHaveBeenCalledWith('job-001', expect.any(Object));
  });

  it('UT_F12_02 – ADMIN xem đơn mà không cần là member', async () => {
    /**
     * Test Case ID : UT_F12_02
     * Test Objective: Admin không cần kiểm tra membership
     * Input         : userRole=ADMIN
     * Expected Output: findByJobId() được gọi; memberRepo KHÔNG được gọi
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({ jobId: 'job-001', userId: 'admin-001', userRole: UserRole.ADMIN });

    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
    expect(appRepo.findByJobId).toHaveBeenCalledTimes(1);
  });

  it('UT_F12_03 – Non-member không thể xem đơn', async () => {
    /**
     * Test Case ID : UT_F12_03
     * Test Objective: RECRUITER không thuộc công ty sở hữu job bị từ chối
     * Input         : findByCompanyAndUser() trả về null
     * Expected Output: AuthorizationError
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({ jobId: 'job-001', userId: 'outsider', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
    expect(appRepo.findByJobId).not.toHaveBeenCalled();
  });

  it('UT_F12_04 – Thất bại khi job không tồn tại', async () => {
    /**
     * Test Case ID : UT_F12_04
     * Test Objective: Lỗi khi jobId không có trong DB
     * Input         : jobId="ghost-job"
     * Expected Output: Error "Job not found"
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn(),
    };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({ jobId: 'ghost-job', userId: 'recruiter-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(/Job not found/);
  });
});

// =====================================================================
// TEST SUITE: UpdateApplicationStatusUseCase
// =====================================================================
describe('F12 - Cập nhật trạng thái đơn ứng tuyển | UpdateApplicationStatusUseCase', () => {

  const makeDeps = (appOverrides?: any, memberOverrides?: any) => {
    const app = buildApplication(appOverrides);
    const updatedApp = buildApplication({ ...appOverrides, id: app.id });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(updatedApp),
      update: jest.fn().mockResolvedValue(updatedApp),
    };
    const jobRepo: jest.Mocked<IJobRepository> = {
      findById: jest.fn().mockResolvedValue(buildJob()),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(memberOverrides ?? buildMember()),
    };
    return { appRepo, jobRepo, memberRepo };
  };

  it('UT_F12_05 – Chuyển trạng thái PENDING → REVIEWING hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_05
     * Test Objective: Chuyển trạng thái từ PENDING sang REVIEWING là hợp lệ
     * Input         : applicationId="app-001", status=REVIEWING, userRole=RECRUITER
     * Expected Output: update() được gọi với status=REVIEWING
     * Notes         : CheckDB – update() phải được gọi 1 lần
     *                 Rollback – mock; không thay đổi DB thực
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.PENDING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    });

    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.REVIEWING }));
  });

  it('UT_F12_06 – Chuyển trạng thái PENDING → ACCEPTED hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_06
     * Test Objective: Trạng thái PENDING được chấp nhận thẳng
     * Input         : status=ACCEPTED từ PENDING
     * Expected Output: update() được gọi thành công
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.PENDING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.ACCEPTED,
    });

    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.ACCEPTED }));
  });

  it('UT_F12_07 – Thất bại khi chuyển trạng thái ACCEPTED → REJECTED (bất hợp lệ)', async () => {
    /**
     * Test Case ID : UT_F12_07
     * Test Objective: Không cho phép chuyển từ trạng thái cuối (ACCEPTED)
     * Input         : current=ACCEPTED, new=REJECTED
     * Expected Output: Error "Invalid status transition from ACCEPTED to REJECTED"
     * Notes         : CheckDB – update() KHÔNG được gọi
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.ACCEPTED });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REJECTED,
    })).rejects.toThrow(/Invalid status transition/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_08 – Thất bại khi CANDIDATE cố cập nhật trạng thái đơn', async () => {
    /**
     * Test Case ID : UT_F12_08
     * Test Objective: CANDIDATE không có quyền cập nhật trạng thái
     * Input         : userRole=CANDIDATE
     * Expected Output: AuthorizationError
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps();
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({
      applicationId: 'app-001',
      userId: 'candidate-001',
      userRole: UserRole.CANDIDATE,
      status: ApplicationStatus.REVIEWING,
    })).rejects.toThrow(AuthorizationError);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_09 – Thất bại khi RECRUITER không phải member của công ty', async () => {
    /**
     * Test Case ID : UT_F12_09
     * Test Objective: RECRUITER không thuộc công ty sở hữu job bị từ chối
     * Input         : findByCompanyAndUser() trả về null
     * Expected Output: AuthorizationError "You must be a member of the company"
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({}, null);
    memberRepo.findByCompanyAndUser.mockResolvedValue(null);
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({
      applicationId: 'app-001',
      userId: 'outsider',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    })).rejects.toThrow(/member of the company/i);
  });

  it('UT_F12_10 – ADMIN cập nhật trạng thái mà không cần membership', async () => {
    /**
     * Test Case ID : UT_F12_10
     * Test Objective: Admin có thể cập nhật mà không cần kiểm tra membership
     * Input         : userRole=ADMIN
     * Expected Output: update() được gọi thành công; memberRepo KHÔNG được gọi
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.PENDING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'admin-001',
      userRole: UserRole.ADMIN,
      status: ApplicationStatus.REVIEWING,
    });

    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
    expect(appRepo.update).toHaveBeenCalledTimes(1);
  });

  it('UT_F12_11 – Thất bại khi application không tồn tại', async () => {
    /**
     * Test Case ID : UT_F12_11
     * Test Objective: NotFoundError khi applicationId không có trong DB
     * Input         : applicationId="ghost-app"
     * Expected Output: NotFoundError "Application not found"
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn() };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = { findByCompanyAndUser: jest.fn() };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({
      applicationId: 'ghost-app',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    })).rejects.toThrow(NotFoundError);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_12 – Ghi notes khi cập nhật trạng thái', async () => {
    /**
     * Test Case ID : UT_F12_12
     * Test Objective: Notes được lưu cùng với việc cập nhật trạng thái
     * Input         : notes="Ứng viên phù hợp yêu cầu"
     * Expected Output: update() nhận { status, notes }
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.PENDING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
      notes: 'Ứng viên phù hợp yêu cầu',
    });

    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({
      status: ApplicationStatus.REVIEWING,
      notes: 'Ứng viên phù hợp yêu cầu',
    }));
  });
});
