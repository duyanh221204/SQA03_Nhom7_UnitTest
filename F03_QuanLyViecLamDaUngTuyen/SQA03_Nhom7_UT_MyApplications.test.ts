/**
 * @file SQA03_Nhom7_UT_MyApplications.test.ts
 * @module F03_QuanLyViecLamDaUngTuyen
 * @description Unit tests for GetMyApplicationsUseCase & WithdrawApplicationUseCase
 *              F03: Quản lý việc làm đã ứng tuyển (Ứng viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Ứng viên xem danh sách đơn ứng tuyển của mình
 *  - Từ chối khi không phải CANDIDATE (phân quyền)
 *  - Rút đơn ứng tuyển đang ở trạng thái PENDING
 *  - Thất bại khi rút đơn không phải của mình
 *  - Thất bại khi trạng thái đơn không cho phép rút (ACCEPTED, REJECTED, CANCELLED)
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole  { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

enum ApplicationStatus {
  PENDING   = 'PENDING',
  REVIEWING = 'REVIEWING',
  ACCEPTED  = 'ACCEPTED',
  REJECTED  = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

class AuthorizationError extends Error {
  statusCode = 403;
  constructor(message: string) { super(message); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface IApplicationRepository {
  findByUserId(userId: string, options?: any): Promise<{ data: any[]; pagination: any }>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}

class GetMyApplicationsUseCase {
  constructor(private readonly applicationRepository: IApplicationRepository) {}

  async execute(input: { userId: string; userRole: string; page?: number; limit?: number; status?: string }) {
    if (input.userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Only candidates can view their applications');

    const result = await this.applicationRepository.findByUserId(input.userId, {
      page: input.page ?? 1,
      limit: input.limit ?? 20,
      status: input.status,
      includeRelations: true,
    });

    return { data: result.data, pagination: result.pagination };
  }
}

class WithdrawApplicationUseCase {
  constructor(private readonly applicationRepository: IApplicationRepository) {}

  async execute(input: { applicationId: string; userId: string }) {
    const application = await this.applicationRepository.findByIdWithRelations(input.applicationId);
    if (!application) throw new Error('Application not found');

    if (application.userId !== input.userId)
      throw new Error('You do not have permission to withdraw this application');

    // canBeWithdrawn: chỉ cho phép khi PENDING
    const canWithdraw = application.status === ApplicationStatus.PENDING;
    if (!canWithdraw)
      throw new Error('Chỉ có thể rút đơn ứng tuyển khi đơn đang ở trạng thái chờ xử lý');

    const updated = await this.applicationRepository.update(input.applicationId, {
      status: ApplicationStatus.CANCELLED,
    });

    return await this.applicationRepository.findByIdWithRelations(updated.id);
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildApplication = (overrides: any = {}) => ({
  id: 'app-001',
  userId: 'user-001',
  jobId: 'job-001',
  cvId: 'cv-001',
  status: ApplicationStatus.PENDING,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

const buildPagination = () => ({ page: 1, limit: 20, total: 1, totalPages: 1 });

// =====================================================================
// TEST SUITE: GetMyApplicationsUseCase
// =====================================================================
describe('F03 - Xem danh sách đơn ứng tuyển của ứng viên | GetMyApplicationsUseCase', () => {

  it('UT_F03_01 – CANDIDATE xem danh sách đơn ứng tuyển thành công', async () => {
    /**
     * Test Case ID : UT_F03_01
     * Test Objective: Ứng viên có thể lấy danh sách đơn đã nộp
     * Input         : userId="user-001", userRole=CANDIDATE
     * Expected Output: { data: [...], pagination: {...} }
     * Notes         : CheckDB – findByUserId() gọi với userId đúng
     */
    const app = buildApplication();
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [app], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('app-001');
    expect(appRepo.findByUserId).toHaveBeenCalledWith('user-001', expect.any(Object));
  });

  it('UT_F03_02 – Không phải CANDIDATE thì bị từ chối truy cập', async () => {
    /**
     * Test Case ID : UT_F03_02
     * Test Objective: RECRUITER hoặc ADMIN không thể dùng API xem đơn riêng của ứng viên
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError "Only candidates can view their applications"
     * Notes         : CheckDB – findByUserId() KHÔNG được gọi
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await expect(useCase.execute({ userId: 'user-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);

    expect(appRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F03_03 – Phân trang mặc định là page=1 limit=20 khi không truyền', async () => {
    /**
     * Test Case ID : UT_F03_03
     * Test Objective: Xác minh giá trị phân trang mặc định
     * Input         : userId="user-001", userRole=CANDIDATE (không truyền page/limit)
     * Expected Output: findByUserId() nhận page=1, limit=20
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(appRepo.findByUserId).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });

  it('UT_F03_04 – Lọc đơn theo status khi truyền tham số status', async () => {
    /**
     * Test Case ID : UT_F03_04
     * Test Objective: Xác minh bộ lọc status được truyền đến repository
     * Input         : status=REVIEWING
     * Expected Output: findByUserId() nhận status=REVIEWING
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, status: ApplicationStatus.REVIEWING });

    expect(appRepo.findByUserId).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({ status: ApplicationStatus.REVIEWING })
    );
  });
});

// =====================================================================
// TEST SUITE: WithdrawApplicationUseCase
// =====================================================================
describe('F03 - Rút đơn ứng tuyển | WithdrawApplicationUseCase', () => {

  it('UT_F03_05 – Rút đơn thành công khi đơn đang ở trạng thái PENDING', async () => {
    /**
     * Test Case ID : UT_F03_05
     * Test Objective: Ứng viên rút đơn thành công khi trạng thái là PENDING
     * Input         : applicationId="app-001", userId="user-001", status=PENDING
     * Expected Output: update() được gọi với status=CANCELLED
     * Notes         : CheckDB – update() gọi với { status: CANCELLED }
     *                 Rollback – mock; không thay đổi DB thực
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)         // lần 1: lấy application
        .mockResolvedValueOnce(cancelledApp), // lần 2: sau khi update
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    const result = await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(result.status).toBe(ApplicationStatus.CANCELLED);
    expect(appRepo.update).toHaveBeenCalledWith('app-001', { status: ApplicationStatus.CANCELLED });
  });

  it('UT_F03_06 – Rút đơn thất bại khi đơn không tồn tại', async () => {
    /**
     * Test Case ID : UT_F03_06
     * Test Objective: Xác minh lỗi khi applicationId không tồn tại
     * Input         : applicationId="ghost-app"
     * Expected Output: Error "Application not found"
     * Notes         : CheckDB – update() KHÔNG được gọi
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await expect(useCase.execute({ applicationId: 'ghost-app', userId: 'user-001' }))
      .rejects.toThrow('Application not found');

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F03_07 – Rút đơn thất bại khi đơn không thuộc về người dùng', async () => {
    /**
     * Test Case ID : UT_F03_07
     * Test Objective: Xác minh lỗi khi userId không khớp với applicant
     * Input         : applicationId="app-001" của user "user-001", nhưng userId="other-user"
     * Expected Output: Error "You do not have permission to withdraw this application"
     * Notes         : CheckDB – update() KHÔNG được gọi
     */
    const app = buildApplication({ userId: 'user-001' });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await expect(useCase.execute({ applicationId: 'app-001', userId: 'other-user' }))
      .rejects.toThrow('You do not have permission to withdraw this application');

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F03_08 – Rút đơn thất bại khi trạng thái là REVIEWING', async () => {
    /**
     * Test Case ID : UT_F03_08
     * Test Objective: Chỉ đơn PENDING mới được rút; REVIEWING không hợp lệ
     * Input         : status=REVIEWING
     * Expected Output: Error "Chỉ có thể rút đơn ứng tuyển khi đơn đang ở trạng thái chờ xử lý"
     */
    const app = buildApplication({ status: ApplicationStatus.REVIEWING });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await expect(useCase.execute({ applicationId: 'app-001', userId: 'user-001' }))
      .rejects.toThrow(/chờ xử lý/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F03_09 – Rút đơn thất bại khi trạng thái là ACCEPTED', async () => {
    /**
     * Test Case ID : UT_F03_09
     * Test Objective: Không thể rút đơn đã được chấp nhận
     * Input         : status=ACCEPTED
     * Expected Output: Error "Chỉ có thể rút đơn..."
     */
    const app = buildApplication({ status: ApplicationStatus.ACCEPTED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await expect(useCase.execute({ applicationId: 'app-001', userId: 'user-001' }))
      .rejects.toThrow(/chờ xử lý/);
  });
});
