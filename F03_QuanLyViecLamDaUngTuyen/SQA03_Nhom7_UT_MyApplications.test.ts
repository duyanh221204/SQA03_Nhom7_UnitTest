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
// IMPORT FROM SOURCE FILE (enables Jest coverage measurement)
// =====================================================================
import {
  UserRole,
  ApplicationStatus,
  AuthorizationError,
  IApplicationRepository,
  GetMyApplicationsUseCase,
  WithdrawApplicationUseCase,
} from './F03.src';

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

  it('UT_F03_10 – Rút đơn thất bại khi trạng thái là REJECTED', async () => {
    /**
     * Test Case ID : UT_F03_10
     * Test Objective: Không thể rút đơn đã bị từ chối
     * Input         : application.status=REJECTED
     * Expected Output: Error chứa "chờ xử lý"; update() KHÔNG được gọi
     */
    const app = buildApplication({ status: ApplicationStatus.REJECTED });
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

  it('UT_F03_11 – Rút đơn thất bại khi trạng thái là CANCELLED', async () => {
    /**
     * Test Case ID : UT_F03_11
     * Test Objective: Không thể rút đơn đã bị hủy
     * Input         : application.status=CANCELLED
     * Expected Output: Error chứa "chờ xử lý"; update() KHÔNG được gọi
     */
    const app = buildApplication({ status: ApplicationStatus.CANCELLED });
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
});

// =====================================================================
// TEST SUITE: GetMyApplicationsUseCase – additional
// =====================================================================
describe('F03 - Xem danh sách đơn ứng tuyển – nâng cao | GetMyApplicationsUseCase', () => {

  it('UT_F03_12 – Phân trang tùy chỉnh (page=2, limit=5) được truyền đúng đến repository', async () => {
    /**
     * Test Case ID : UT_F03_12
     * Test Objective: Xác minh tham số phân trang tùy chỉnh được truyền nguyên vẹn
     * Input         : userRole=CANDIDATE, page=2, limit=5
     * Expected Output: findByUserId() nhận options với page=2, limit=5
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, page: 2, limit: 5 });

    expect(appRepo.findByUserId).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({ page: 2, limit: 5 })
    );
  });

  it('UT_F03_13 – includeRelations=true được truyền vào findByUserId()', async () => {
    /**
     * Test Case ID : UT_F03_13
     * Test Objective: Xác minh luôn lấy kèm quan hệ (job, company...) khi xem danh sách
     * Input         : userId="user-001", userRole=CANDIDATE
     * Expected Output: findByUserId() nhận options có includeRelations=true
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
      expect.objectContaining({ includeRelations: true })
    );
  });

  it('UT_F03_14 – findByIdWithRelations() được gọi lần 2 sau khi update() thành công', async () => {
    /**
     * Test Case ID : UT_F03_14
     * Test Objective: Sau khi rút đơn, hệ thống phải trả về dữ liệu mới nhất từ DB
     * Input         : applicationId="app-001", userId="user-001", status=PENDING
     * Expected Output: findByIdWithRelations() được gọi 2 lần (1 lần trước, 1 lần sau update)
     * Notes         : CheckDB – lần gọi thứ 2 xác nhận dữ liệu DB đã thay đổi
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(appRepo.findByIdWithRelations).toHaveBeenCalledTimes(2);
  });

  it('UT_F03_15 – Kết quả GetMyApplications có đầy đủ pagination (page, limit, total, totalPages)', async () => {
    /**
     * Test Case ID : UT_F03_15
     * Test Objective: Xác minh thông tin phân trang được truyền đúng về cho client
     * Input         : Repository trả về pagination = { page:1, limit:20, total:5, totalPages:1 }
     * Expected Output: result.pagination khớp hoàn toàn với giá trị từ repository
     * Notes         : Client cần pagination để hiển thị điều hướng trang
     */
    const pagination = { page: 1, limit: 20, total: 5, totalPages: 1 };
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [], pagination }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(result.pagination).toEqual(pagination);
  });

  it('UT_F03_16 – Danh sách rỗng khi ứng viên chưa nộp đơn nào', async () => {
    /**
     * Test Case ID : UT_F03_16
     * Test Objective: Xác minh hệ thống trả về mảng rỗng (không lỗi) khi không có đơn
     * Input         : userId="user-001" chưa ứng tuyển job nào
     * Expected Output: result.data là mảng rỗng []
     * Notes         : Không được ném lỗi; danh sách rỗng là trường hợp bình thường
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(result.data).toHaveLength(0);
    expect(result.data).toEqual([]);
  });

  it('UT_F03_17 – Trả về nhiều đơn khi ứng viên đã ứng tuyển nhiều job', async () => {
    /**
     * Test Case ID : UT_F03_17
     * Test Objective: Xác minh hệ thống trả về toàn bộ danh sách đơn đúng số lượng
     * Input         : Repository trả về 3 đơn khác nhau (app-001, app-002, app-003)
     * Expected Output: result.data có đúng 3 phần tử
     * Notes         : CheckDB – phải lấy đủ tất cả đơn của user, không bị thiếu
     */
    const apps = [
      buildApplication({ id: 'app-001', jobId: 'job-001' }),
      buildApplication({ id: 'app-002', jobId: 'job-002' }),
      buildApplication({ id: 'app-003', jobId: 'job-003' }),
    ];
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn().mockResolvedValue({ data: apps, pagination: { ...buildPagination(), total: 3 } }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    const result = await useCase.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

    expect(result.data).toHaveLength(3);
  });

  it('UT_F03_18 – WithdrawApplication: update() được gọi đúng 1 lần với applicationId đúng', async () => {
    /**
     * Test Case ID : UT_F03_18
     * Test Objective: Xác minh không có vòng lặp/retry và đúng bản ghi được cập nhật
     * Input         : applicationId="app-001", status=PENDING
     * Expected Output: appRepo.update() gọi đúng 1 lần với "app-001"
     * Notes         : Rollback – gọi nhiều lần hoặc sai ID sẽ gây lỗi dữ liệu DB
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(appRepo.update).toHaveBeenCalledTimes(1);
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.any(Object));
  });

  it('UT_F03_19 – RECRUITER bị từ chối khi cố xem đơn ứng tuyển cá nhân', async () => {
    /**
     * Test Case ID : UT_F03_19
     * Test Objective: Xác minh phân quyền đúng – chỉ CANDIDATE mới được xem đơn của mình
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError; findByUserId() KHÔNG được gọi
     * Notes         : Bảo mật – nhà tuyển dụng không được truy cập API này
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await expect(
      useCase.execute({ userId: 'recruiter-001', userRole: UserRole.RECRUITER })
    ).rejects.toThrow(AuthorizationError);

    expect(appRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F03_20 – Lọc theo status=REVIEWING được truyền đúng vào findByUserId()', async () => {
    /**
     * Test Case ID : UT_F03_20
     * Test Objective: Xác minh tham số status được chuyển đúng vào repository khi lọc
     * Input         : userId="user-001", userRole=CANDIDATE, status=REVIEWING
     * Expected Output: findByUserId() nhận options có status=REVIEWING
     * Notes         : CheckDB – lọc sai status sẽ lấy sai tập dữ liệu
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

  it('UT_F03_21 – ADMIN bị từ chối khi cố dùng GetMyApplicationsUseCase', async () => {
    /**
     * Test Case ID : UT_F03_21
     * Test Objective: Xác minh ADMIN không thể truy cập API xem đơn cá nhân ứng viên
     * Input         : userRole=ADMIN
     * Expected Output: AuthorizationError; findByUserId() KHÔNG được gọi
     * Notes         : Bảo mật – mỗi role có API riêng
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetMyApplicationsUseCase(appRepo);

    await expect(
      useCase.execute({ userId: 'admin-001', userRole: UserRole.ADMIN })
    ).rejects.toThrow(AuthorizationError);

    expect(appRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F03_22 – WithdrawApplication trả về đơn có status=CANCELLED sau khi rút thành công', async () => {
    /**
     * Test Case ID : UT_F03_22
     * Test Objective: Xác minh kết quả trả về phản ánh trạng thái mới nhất trong DB
     * Input         : applicationId="app-001", status=PENDING → rút thành công
     * Expected Output: Kết quả trả về có status=CANCELLED
     * Notes         : CheckDB – lần gọi findByIdWithRelations() thứ 2 trả về đơn đã cập nhật
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    const result = await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(result).toBeDefined();
    expect(result.status).toBe(ApplicationStatus.CANCELLED);
  });

  it('UT_F03_23 – update() được gọi với đúng payload { status: CANCELLED } khi rút đơn', async () => {
    /**
     * Test Case ID : UT_F03_23
     * Test Objective: Xác minh payload được truyền đúng khi cập nhật DB
     * Input         : applicationId="app-001", status=PENDING
     * Expected Output: update() nhận payload có status=CANCELLED
     * Notes         : CheckDB – sai payload sẽ lưu sai trạng thái vào DB
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(appRepo.update).toHaveBeenCalledWith(
      'app-001',
      expect.objectContaining({ status: ApplicationStatus.CANCELLED })
    );
  });

  it('UT_F03_24 – findByIdWithRelations() lần đầu gọi đúng với applicationId khi rút đơn', async () => {
    /**
     * Test Case ID : UT_F03_24
     * Test Objective: Xác minh tra cứu đơn bằng đúng applicationId trước khi xử lý
     * Input         : applicationId="app-001"
     * Expected Output: findByIdWithRelations() gọi lần đầu với "app-001"
     * Notes         : CheckDB – sai ID sẽ thao tác trên đơn sai
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByUserId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const useCase = new WithdrawApplicationUseCase(appRepo);

    await useCase.execute({ applicationId: 'app-001', userId: 'user-001' });

    expect(appRepo.findByIdWithRelations).toHaveBeenNthCalledWith(1, 'app-001');
  });

  it('UT_F03_25 – Giá trị mặc định limit=20 được truyền vào findByUserId() khi không chỉ định', async () => {
    /**
     * Test Case ID : UT_F03_25
     * Test Objective: Xác minh limit mặc định 20 kết quả mỗi trang khi không truyền limit
     * Input         : userId="user-001", userRole=CANDIDATE, không truyền limit
     * Expected Output: findByUserId() nhận options có limit=20
     * Notes         : Đảm bảo phân trang mặc định hợp lý, không tải quá nhiều dữ liệu
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
      expect.objectContaining({ limit: 20 })
    );
  });
});
