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
// IMPORT FROM SOURCE FILE (enables Jest coverage measurement)
// =====================================================================
import {
  UserRole,
  ApplicationStatus,
  AuthorizationError,
  NotFoundError,
  IApplicationRepository,
  IJobRepository,
  ICompanyMemberRepository,
  GetApplicationsByJobUseCase,
  UpdateApplicationStatusUseCase,
} from './F12.src';

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

  it('UT_F12_13 – Chuyển trạng thái REVIEWING → ACCEPTED hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_13
     * Test Objective: Chuyển trạng thái từ REVIEWING sang ACCEPTED là hợp lệ
     * Input         : currentStatus=REVIEWING, newStatus=ACCEPTED, userRole=RECRUITER
     * Expected Output: update() được gọi với status=ACCEPTED
     * Notes         : CheckDB – update() gọi 1 lần
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.REVIEWING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.ACCEPTED,
    });

    expect(appRepo.update).toHaveBeenCalledWith(
      'app-001', expect.objectContaining({ status: ApplicationStatus.ACCEPTED })
    );
  });

  it('UT_F12_14 – Chuyển trạng thái REVIEWING → REJECTED hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_14
     * Test Objective: Chuyển trạng thái từ REVIEWING sang REJECTED là hợp lệ
     * Input         : currentStatus=REVIEWING, newStatus=REJECTED
     * Expected Output: update() được gọi với status=REJECTED
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.REVIEWING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REJECTED,
    });

    expect(appRepo.update).toHaveBeenCalledWith(
      'app-001', expect.objectContaining({ status: ApplicationStatus.REJECTED })
    );
  });

  it('UT_F12_15 – Chuyển trạng thái PENDING → CANCELLED hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_15
     * Test Objective: RECRUITER có thể huỷ đơn từ trạng thái PENDING
     * Input         : currentStatus=PENDING, newStatus=CANCELLED
     * Expected Output: update() được gọi với status=CANCELLED
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.PENDING });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.CANCELLED,
    });

    expect(appRepo.update).toHaveBeenCalledWith(
      'app-001', expect.objectContaining({ status: ApplicationStatus.CANCELLED })
    );
  });

  it('UT_F12_16 – Thất bại khi chuyển trạng thái REJECTED → CANCELLED (bất hợp lệ)', async () => {
    /**
     * Test Case ID : UT_F12_16
     * Test Objective: Không cho phép chuyển trạng thái từ trạng thái cuối REJECTED
     * Input         : currentStatus=REJECTED, newStatus=CANCELLED
     * Expected Output: Error "Invalid status transition from REJECTED to CANCELLED"
     * Notes         : CheckDB – update() KHÔNG được gọi
     */
    const { appRepo, jobRepo, memberRepo } = makeDeps({ status: ApplicationStatus.REJECTED });
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.CANCELLED,
    })).rejects.toThrow(/Invalid status transition/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });
});

// =====================================================================
// TEST SUITE: GetApplicationsByJobUseCase – additional
// =====================================================================
describe('F12 - Xem danh sách đơn theo job – nâng cao | GetApplicationsByJobUseCase', () => {

  it('UT_F12_17 – Phân trang mặc định page=1, limit=10 khi không truyền', async () => {
    /**
     * Test Case ID : UT_F12_17
     * Test Objective: Xác minh giá trị phân trang mặc định trong GetApplicationsByJobUseCase
     * Input         : jobId="job-001", userRole=ADMIN (không truyền page/limit)
     * Expected Output: findByJobId() nhận page=1, limit=10
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

    expect(appRepo.findByJobId).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ page: 1, limit: 10 })
    );
  });

  it('UT_F12_18 – Lọc danh sách đơn theo status trong GetApplicationsByJobUseCase', async () => {
    /**
     * Test Case ID : UT_F12_18
     * Test Objective: Xác minh bộ lọc status được truyền đến repository khi xem đơn theo job
     * Input         : jobId="job-001", userRole=ADMIN, status=REVIEWING
     * Expected Output: findByJobId() nhận options có status=REVIEWING
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

    await useCase.execute({
      jobId: 'job-001',
      userId: 'admin-001',
      userRole: UserRole.ADMIN,
      status: ApplicationStatus.REVIEWING,
    });

    expect(appRepo.findByJobId).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ status: ApplicationStatus.REVIEWING })
    );
  });

  it('UT_F12_19 – Kết quả xem đơn theo job có đầy đủ pagination', async () => {
    /**
     * Test Case ID : UT_F12_19
     * Test Objective: Xác minh pagination được trả về chính xác từ repository
     * Input         : jobId="job-001", userRole=ADMIN; repository trả về pagination có total=3
     * Expected Output: result.pagination = { page:1, limit:10, total:3, totalPages:1 }
     * Notes         : Client cần pagination để điều hướng danh sách đơn ứng tuyển
     */
    const pagination = { page: 1, limit: 10, total: 3, totalPages: 1 };
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn().mockResolvedValue({ data: [], pagination }),
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

    const result = await useCase.execute({ jobId: 'job-001', userId: 'admin-001', userRole: UserRole.ADMIN });

    expect(result.pagination).toEqual(pagination);
  });

  it('UT_F12_20 – findByIdWithRelations() được gọi 2 lần trong UpdateApplicationStatusUseCase thành công', async () => {
    /**
     * Test Case ID : UT_F12_20
     * Test Objective: Xác minh sau khi update(), hệ thống tải lại dữ liệu mới nhất từ DB
     * Input         : applicationId="app-001", status PENDING→REVIEWING, userRole=RECRUITER
     * Expected Output: findByIdWithRelations() được gọi đúng 2 lần
     * Notes         : CheckDB – lần gọi thứ 2 xác nhận DB đã cập nhật đúng
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const updatedApp = buildApplication({ status: ApplicationStatus.REVIEWING });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValueOnce(app).mockResolvedValueOnce(updatedApp),
      update: jest.fn().mockResolvedValue(updatedApp),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    });

    expect(appRepo.findByIdWithRelations).toHaveBeenCalledTimes(2);
  });

  it('UT_F12_21 – Chuyển trạng thái REVIEWING → CANCELLED hợp lệ', async () => {
    /**
     * Test Case ID : UT_F12_21
     * Test Objective: Xác minh REVIEWING→CANCELLED là chuyển trạng thái hợp lệ
     * Input         : applicationId="app-001", status=CANCELLED, current=REVIEWING, userRole=RECRUITER
     * Expected Output: update() được gọi với status=CANCELLED
     * Notes         : CheckDB – nhà tuyển dụng có quyền hủy đơn đang xem xét
     */
    const app = buildApplication({ status: ApplicationStatus.REVIEWING });
    const cancelledApp = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValueOnce(app).mockResolvedValueOnce(cancelledApp),
      update: jest.fn().mockResolvedValue(cancelledApp),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.CANCELLED,
    });

    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.CANCELLED }));
  });

  it('UT_F12_22 – Thất bại khi chuyển trạng thái ACCEPTED → PENDING (bất hợp lệ)', async () => {
    /**
     * Test Case ID : UT_F12_22
     * Test Objective: Xác minh trạng thái cuối (ACCEPTED) không thể chuyển ngược
     * Input         : applicationId="app-001", current=ACCEPTED, target=PENDING
     * Expected Output: Ném lỗi "Invalid status transition"; update() KHÔNG được gọi
     * Notes         : Rollback – DB phải giữ nguyên trạng thái ACCEPTED
     */
    const app = buildApplication({ status: ApplicationStatus.ACCEPTED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(
      useCase.execute({
        applicationId: 'app-001',
        userId: 'recruiter-001',
        userRole: UserRole.RECRUITER,
        status: ApplicationStatus.PENDING,
      })
    ).rejects.toThrow(/Invalid status transition/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_23 – Phân trang tùy chỉnh (page=3, limit=5) được truyền đúng đến repository', async () => {
    /**
     * Test Case ID : UT_F12_23
     * Test Objective: Xác minh phân trang tùy chỉnh được truyền đúng đến findByJobId()
     * Input         : jobId="job-001", userRole=ADMIN, page=3, limit=5
     * Expected Output: findByJobId() nhận options có page=3 và limit=5
     * Notes         : CheckDB – phân trang sai sẽ lấy sai tập dữ liệu từ DB
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

    await useCase.execute({ jobId: 'job-001', userId: 'admin-001', userRole: UserRole.ADMIN, page: 3, limit: 5 });

    expect(appRepo.findByJobId).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ page: 3, limit: 5 })
    );
  });

  it('UT_F12_24 – CANDIDATE bị từ chối khi cố cập nhật trạng thái đơn ứng tuyển', async () => {
    /**
     * Test Case ID : UT_F12_24
     * Test Objective: Xác minh phân quyền – CANDIDATE không được dùng UpdateApplicationStatus
     * Input         : userRole=CANDIDATE, applicationId="app-001"
     * Expected Output: AuthorizationError; update() KHÔNG được gọi
     * Notes         : Bảo mật – ứng viên không tự thay đổi trạng thái đơn của mình qua API này
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn() };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = { findByCompanyAndUser: jest.fn() };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(
      useCase.execute({
        applicationId: 'app-001',
        userId: 'candidate-001',
        userRole: UserRole.CANDIDATE,
        status: ApplicationStatus.REVIEWING,
      })
    ).rejects.toThrow(AuthorizationError);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_25 – Kết quả UpdateApplicationStatus trả về đơn mới nhất từ DB', async () => {
    /**
     * Test Case ID : UT_F12_25
     * Test Objective: Xác minh response là dữ liệu tươi nhất sau khi cập nhật thành công
     * Input         : PENDING → REVIEWING hợp lệ
     * Expected Output: Kết quả có status=REVIEWING (từ lần gọi findByIdWithRelations thứ 2)
     * Notes         : CheckDB – client cần nhận đúng trạng thái mới nhất
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING });
    const reviewingApp = buildApplication({ status: ApplicationStatus.REVIEWING });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(reviewingApp),
      update: jest.fn().mockResolvedValue(reviewingApp),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    const result = await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    });

    expect(result).toBeDefined();
    expect(result.status).toBe(ApplicationStatus.REVIEWING);
  });

  it('UT_F12_26 – includeRelations=true được truyền vào findByJobId() trong GetApplicationsByJobUseCase', async () => {
    /**
     * Test Case ID : UT_F12_26
     * Test Objective: Xác minh dữ liệu liên quan (job, candidate) luôn được tải cùng danh sách đơn
     * Input         : jobId="job-001", userRole=ADMIN
     * Expected Output: findByJobId() nhận options có includeRelations=true
     * Notes         : CheckDB – thiếu includeRelations sẽ trả về đơn thiếu thông tin
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = { findByCompanyAndUser: jest.fn() };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({ jobId: 'job-001', userId: 'admin-001', userRole: UserRole.ADMIN });

    expect(appRepo.findByJobId).toHaveBeenCalledWith(
      'job-001',
      expect.objectContaining({ includeRelations: true })
    );
  });

  it('UT_F12_27 – ACCEPTED → REVIEWING bất hợp lệ, update() không được gọi', async () => {
    /**
     * Test Case ID : UT_F12_27
     * Test Objective: Xác minh đơn đã ACCEPTED không thể chuyển về REVIEWING
     * Input         : current=ACCEPTED, target=REVIEWING
     * Expected Output: Ném lỗi "Invalid status transition"; update() không được gọi
     * Notes         : Rollback – DB phải giữ nguyên trạng thái ACCEPTED
     */
    const app = buildApplication({ status: ApplicationStatus.ACCEPTED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(
      useCase.execute({
        applicationId: 'app-001',
        userId: 'recruiter-001',
        userRole: UserRole.RECRUITER,
        status: ApplicationStatus.REVIEWING,
      })
    ).rejects.toThrow(/Invalid status transition/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_28 – CANCELLED → bất kỳ trạng thái nào đều bất hợp lệ (CANCELLED → PENDING)', async () => {
    /**
     * Test Case ID : UT_F12_28
     * Test Objective: Xác minh đơn đã CANCELLED là trạng thái cuối, không thể phục hồi
     * Input         : current=CANCELLED, target=PENDING
     * Expected Output: Ném lỗi "Invalid status transition"; update() không được gọi
     * Notes         : Rollback – trạng thái CANCELLED là không thể đảo ngược
     */
    const app = buildApplication({ status: ApplicationStatus.CANCELLED });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await expect(
      useCase.execute({
        applicationId: 'app-001',
        userId: 'recruiter-001',
        userRole: UserRole.RECRUITER,
        status: ApplicationStatus.PENDING,
      })
    ).rejects.toThrow(/Invalid status transition/);

    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F12_29 – jobRepo.findById() được gọi đúng với jobId khi UpdateApplicationStatusUseCase', async () => {
    /**
     * Test Case ID : UT_F12_29
     * Test Objective: Xác minh hệ thống tra cứu đúng job để kiểm tra membership của recruiter
     * Input         : applicationId="app-001" có jobId="job-001", userRole=RECRUITER
     * Expected Output: jobRepo.findById() được gọi đúng 1 lần với "job-001"
     * Notes         : CheckDB – sai jobId sẽ kiểm tra membership của công ty sai
     */
    const app = buildApplication({ status: ApplicationStatus.PENDING, jobId: 'job-001' });
    const updatedApp = buildApplication({ status: ApplicationStatus.REVIEWING });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn(),
      findByIdWithRelations: jest.fn()
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(updatedApp),
      update: jest.fn().mockResolvedValue(updatedApp),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()),
    };
    const useCase = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);

    await useCase.execute({
      applicationId: 'app-001',
      userId: 'recruiter-001',
      userRole: UserRole.RECRUITER,
      status: ApplicationStatus.REVIEWING,
    });

    expect(jobRepo.findById).toHaveBeenCalledTimes(1);
    expect(jobRepo.findById).toHaveBeenCalledWith('job-001');
  });

  it('UT_F12_30 – Danh sách đơn rỗng khi job chưa có ứng viên nào nộp', async () => {
    /**
     * Test Case ID : UT_F12_30
     * Test Objective: Xác minh hệ thống trả về mảng rỗng (không lỗi) khi chưa có đơn
     * Input         : jobId="job-001", userRole=ADMIN; repository trả về data=[]
     * Expected Output: result.data là mảng rỗng []
     * Notes         : Không được ném lỗi; danh sách rỗng là bình thường khi job mới đăng
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findByJobId: jest.fn().mockResolvedValue({ data: [], pagination: buildPagination() }),
      findByIdWithRelations: jest.fn(),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn().mockResolvedValue(buildJob()) };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = { findByCompanyAndUser: jest.fn() };
    const useCase = new GetApplicationsByJobUseCase(appRepo, jobRepo, memberRepo);

    const result = await useCase.execute({ jobId: 'job-001', userId: 'admin-001', userRole: UserRole.ADMIN });

    expect(result.data).toHaveLength(0);
    expect(result.data).toEqual([]);
  });
});
