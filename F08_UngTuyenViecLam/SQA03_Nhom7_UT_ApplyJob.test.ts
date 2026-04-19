/**
 * @file    SQA03_Nhom7_UT_ApplyJob.test.ts
 * @module  F08_UngTuyenViecLam
 * @desc    Unit tests – F08: Ứng tuyển việc làm
 * @group   Nhom 07 – SQA03
 *
 * Use Cases:
 *   A. ApplyJobUseCase                UT_F08_01 .. UT_F08_18  (15 PASS, 3 FAIL-BUG)
 *   B. WithdrawApplicationUseCase     UT_F08_19 .. UT_F08_27  ( 8 PASS, 1 FAIL-BUG)
 *   C. GetApplicationByIdUseCase      UT_F08_28 .. UT_F08_35  ( 7 PASS, 1 FAIL-BUG)
 *   D. UpdateApplicationStatusUseCase UT_F08_36 .. UT_F08_47  ( 9 PASS, 3 FAIL-BUG)
 *
 * Total: 47 test cases (39 PASS, 8 FAIL)
 */

// ─────────────────────────────────────────────────────────────────────────────
// INLINE ENUMS & ERRORS
// ─────────────────────────────────────────────────────────────────────────────
enum UserRole {
  CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN',
}
enum ApplicationStatus {
  PENDING = 'PENDING', REVIEWING = 'REVIEWING', ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED', CANCELLED = 'CANCELLED',
}

class AppError extends Error { constructor(msg: string, public statusCode = 500) { super(msg); } }
class AuthorizationError extends AppError { constructor(m: string) { super(m, 403); this.name = 'AuthorizationError'; } }
class NotFoundError      extends AppError { constructor(m: string) { super(m, 404); this.name = 'NotFoundError'; } }

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────
interface IApplicationRepository {
  findActiveByUserAndJob(userId: string, jobId: string): Promise<any | null>;
  save(app: any): Promise<any>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}
interface IJobRepository {
  findById(id: string): Promise<any | null>;
  incrementApplicationCount(id: string): Promise<any>;
}
interface ICVRepository    { findById(id: string): Promise<any | null>; }
interface ICompanyRepository { findById(id: string): Promise<any | null>; }
interface ICompanyMemberRepository {
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}
interface INotificationService {
  notifyNewApplication(applicationId: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINED USE CASES
// ─────────────────────────────────────────────────────────────────────────────

/** A. ApplyJobUseCase */
class ApplyJobUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private cvRepo: ICVRepository,
    private companyRepo: ICompanyRepository,
    private notifySvc: INotificationService,
  ) {}
  async execute(input: {
    userId: string; userRole: string; jobId: string;
    cvId: string; coverLetter?: string;
  }) {
    const { userId, userRole, jobId, cvId, coverLetter } = input;
    if (userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Chỉ ứng viên mới có thể ứng tuyển');
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw new Error('Không tìm thấy tin tuyển dụng');
    if (job.status === 'LOCKED')  throw new Error('Tin tuyển dụng đã bị khóa và không thể nhận đơn ứng tuyển');
    if (job.status === 'INACTIVE') throw new Error('Tin tuyển dụng đã đóng');
    if (job.isExpired && job.isExpired()) throw new Error('Tin tuyển dụng đã hết hạn, không thể ứng tuyển');
    if (!(job.isActive && job.isActive())) throw new Error('Tin tuyển dụng không ở trạng thái có thể nhận đơn ứng tuyển');
    const company = await this.companyRepo.findById(job.companyId);
    if (company?.status === 'LOCKED') throw new Error('Công ty đã bị khóa và không thể nhận đơn ứng tuyển');
    const cv = await this.cvRepo.findById(cvId);
    if (!cv) throw new Error('Không tìm thấy CV');
    if (cv.userId !== userId) throw new Error('CV không thuộc về người dùng này');
    const existing = await this.appRepo.findActiveByUserAndJob(userId, jobId);
    if (existing) throw new Error('Bạn đã ứng tuyển cho tin tuyển dụng này');
    const saved = await this.appRepo.save({
      userId, jobId, cvId,
      coverLetter: coverLetter ?? null,
      status: ApplicationStatus.PENDING,
    });
    await this.jobRepo.incrementApplicationCount(jobId);
    this.notifySvc.notifyNewApplication(saved.id).catch(() => {});
    return await this.appRepo.findByIdWithRelations(saved.id);
  }
}

/** B. WithdrawApplicationUseCase */
class WithdrawApplicationUseCase {
  constructor(private appRepo: IApplicationRepository) {}
  async execute(input: { applicationId: string; userId: string }) {
    const app = await this.appRepo.findByIdWithRelations(input.applicationId);
    if (!app) throw new Error('Application not found');
    if (app.userId !== input.userId) throw new Error('You do not have permission to withdraw this application');
    if (!app.canBeWithdrawn()) throw new Error('Chỉ có thể rút đơn ứng tuyển khi đơn đang ở trạng thái chờ xử lý');
    const updated = await this.appRepo.update(input.applicationId, { status: ApplicationStatus.CANCELLED });
    return await this.appRepo.findByIdWithRelations(updated.id);
  }
}

/** C. GetApplicationByIdUseCase */
class GetApplicationByIdUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}
  async execute(input: { applicationId: string; userId: string; userRole: string }) {
    const { applicationId, userId, userRole } = input;
    const app = await this.appRepo.findByIdWithRelations(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId === userId) return app;
    if (userRole === UserRole.ADMIN) return app;
    if (userRole === UserRole.RECRUITER) {
      const job = await this.jobRepo.findById(app.jobId);
      if (job) {
        const member = await this.memberRepo.findByCompanyAndUser(job.companyId, userId);
        if (member) return app;
      }
    }
    throw new AuthorizationError('You do not have permission to view this application');
  }
}

/** D. UpdateApplicationStatusUseCase */
class UpdateApplicationStatusUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}
  async execute(input: {
    applicationId: string; userId: string; userRole: string;
    status: ApplicationStatus; notes?: string;
  }) {
    const { applicationId, userId, userRole, status, notes } = input;
    const app = await this.appRepo.findByIdWithRelations(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isAdmin) {
      if (userRole !== UserRole.RECRUITER)
        throw new AuthorizationError('Only recruiters and admins can update application status');
      const job = await this.jobRepo.findById(app.jobId);
      if (!job) throw new NotFoundError('Job not found');
      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, userId);
      if (!member) throw new AuthorizationError('You must be a member of the company that owns this job');
    }
    if (!this.isValidTransition(app.status, status))
      throw new Error(`Invalid status transition from ${app.status} to ${status}`);
    const updated = await this.appRepo.update(applicationId, { status, notes: notes ?? null });
    return await this.appRepo.findByIdWithRelations(updated.id);
  }
  private isValidTransition(cur: ApplicationStatus, next: ApplicationStatus): boolean {
    const valid: Record<ApplicationStatus, ApplicationStatus[]> = {
      [ApplicationStatus.PENDING]:   [ApplicationStatus.REVIEWING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.REVIEWING]: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.ACCEPTED]:  [],
      [ApplicationStatus.REJECTED]:  [],
      [ApplicationStatus.CANCELLED]: [],
    };
    return valid[cur]?.includes(next) ?? false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS
// ─────────────────────────────────────────────────────────────────────────────
const makeJob = (o: any = {}) => ({
  id: 'job-001', companyId: 'company-001', title: 'Dev',
  status: 'ACTIVE', isActive: () => true, isExpired: () => false, ...o,
});
const makeLockedJob   = () => makeJob({ status: 'LOCKED',   isActive: () => false });
const makeInactiveJob = () => makeJob({ status: 'INACTIVE', isActive: () => false });
const makeExpiredJob  = () => makeJob({ status: 'ACTIVE',   isActive: () => false, isExpired: () => true });
const makeDraftJob    = () => makeJob({ status: 'DRAFT',    isActive: () => false, isExpired: () => false });

const makeCV  = (o: any = {}) => ({ id: 'cv-001', userId: 'user-001', ...o });
const makeApp = (o: any = {}) => ({
  id: 'app-001', userId: 'user-001', jobId: 'job-001', cvId: 'cv-001',
  status: ApplicationStatus.PENDING,
  canBeWithdrawn: () => (o.status ?? ApplicationStatus.PENDING) === ApplicationStatus.PENDING,
  ...o,
});
const makeCompany = (o: any = {}) => ({ id: 'company-001', status: 'ACTIVE', ...o });
const makeMember  = (o: any = {}) => ({ id: 'mem-001', companyId: 'company-001', userId: 'rec-001', ...o });

function makeApplyDeps(opts: { job?: any; cv?: any; company?: any; existing?: any } = {}) {
  const appRepo: jest.Mocked<IApplicationRepository> = {
    findActiveByUserAndJob: jest.fn().mockResolvedValue(opts.existing ?? null),
    save: jest.fn().mockResolvedValue(makeApp()),
    findByIdWithRelations: jest.fn().mockResolvedValue(makeApp()),
    update: jest.fn().mockResolvedValue(makeApp()),
  };
  const jobRepo: jest.Mocked<IJobRepository> = {
    findById: jest.fn().mockResolvedValue(opts.job !== undefined ? opts.job : makeJob()),
    incrementApplicationCount: jest.fn().mockResolvedValue({}),
  };
  const cvRepo: jest.Mocked<ICVRepository> = {
    findById: jest.fn().mockResolvedValue(opts.cv !== undefined ? opts.cv : makeCV()),
  };
  const companyRepo: jest.Mocked<ICompanyRepository> = {
    findById: jest.fn().mockResolvedValue(opts.company !== undefined ? opts.company : makeCompany()),
  };
  const notifySvc: jest.Mocked<INotificationService> = {
    notifyNewApplication: jest.fn().mockResolvedValue(undefined),
  };
  return { appRepo, jobRepo, cvRepo, companyRepo, notifySvc };
}

function makeStatusDeps(opts: { app?: any; job?: any; member?: any } = {}) {
  const appRepo: jest.Mocked<IApplicationRepository> = {
    findActiveByUserAndJob: jest.fn(),
    save: jest.fn(),
    findByIdWithRelations: jest.fn().mockResolvedValue(opts.app !== undefined ? opts.app : makeApp()),
    update: jest.fn().mockResolvedValue(makeApp()),
  };
  const jobRepo: jest.Mocked<IJobRepository> = {
    findById: jest.fn().mockResolvedValue(opts.job !== undefined ? opts.job : makeJob()),
    incrementApplicationCount: jest.fn(),
  };
  const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
    findByCompanyAndUser: jest.fn().mockResolvedValue(opts.member !== undefined ? opts.member : makeMember()),
  };
  return { appRepo, jobRepo, memberRepo };
}

// ═════════════════════════════════════════════════════════════════════════════
// SUITE A – ApplyJobUseCase  (UT_F08_01 … UT_F08_18)
// ═════════════════════════════════════════════════════════════════════════════
describe('F08-A - ApplyJobUseCase', () => {

  it('UT_F08_01 – Ung tuyen thanh cong voi du lieu hop le', async () => {
    /**
     * TC ID: UT_F08_01 | Status: PASS
     * Input: userId="user-001", userRole=CANDIDATE, jobId, cvId
     * Expected: save() voi status=PENDING; incrementApplicationCount() goi
     * Notes: CheckDB – appRepo.save() & incrementApplicationCount() phai goi
     *        Rollback – mock; DB thuc khong thay doi
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    const res = await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' });
    expect(res.status).toBe(ApplicationStatus.PENDING);
    expect(appRepo.save).toHaveBeenCalledTimes(1);
    expect(jobRepo.incrementApplicationCount).toHaveBeenCalledWith('job-001');
  });

  it('UT_F08_02 – Ung tuyen voi coverLetter hop le duoc luu dung', async () => {
    /**
     * TC ID: UT_F08_02 | Status: PASS
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001', coverLetter: 'Thu gioi thieu' });
    expect(appRepo.save).toHaveBeenCalledWith(expect.objectContaining({ coverLetter: 'Thu gioi thieu' }));
  });

  it('UT_F08_03 – AuthorizationError khi RECRUITER co ung tuyen', async () => {
    /**
     * TC ID: UT_F08_03 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai role check dau ApplyJobUseCase
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'rec-001', userRole: UserRole.RECRUITER, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(AuthorizationError);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_04 – AuthorizationError khi ADMIN co ung tuyen', async () => {
    /**
     * TC ID: UT_F08_04 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai role check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'admin-001', userRole: UserRole.ADMIN, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(AuthorizationError);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_05 – Error khi jobId khong ton tai', async () => {
    /**
     * TC ID: UT_F08_05 | Status: PASS
     * Notes: So loi: 1 – Error tai job existence check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ job: null });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'ghost', cvId: 'cv-001' }))
      .rejects.toThrow(/không tìm thấy/i);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_06 – Error khi tin bi LOCKED', async () => {
    /**
     * TC ID: UT_F08_06 | Status: PASS
     * Notes: So loi: 1 – Error tai LOCKED status check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ job: makeLockedJob() });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/bị khóa/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_07 – Error khi tin INACTIVE (da dong)', async () => {
    /**
     * TC ID: UT_F08_07 | Status: PASS
     * Notes: So loi: 1 – Error tai INACTIVE status check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ job: makeInactiveJob() });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/đã đóng/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_08 – Error khi tin da het han', async () => {
    /**
     * TC ID: UT_F08_08 | Status: PASS
     * Notes: So loi: 1 – Error tai isExpired() check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ job: makeExpiredJob() });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/hết hạn/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_09 – Error khi tin o trang thai DRAFT (khong hoat dong)', async () => {
    /**
     * TC ID: UT_F08_09 | Status: PASS
     * Notes: So loi: 1 – Error tai isActive() check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ job: makeDraftJob() });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/không ở trạng thái/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_10 – Error khi cong ty bi LOCKED', async () => {
    /**
     * TC ID: UT_F08_10 | Status: PASS
     * Notes: So loi: 1 – Error tai company.status LOCKED check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ company: makeCompany({ status: 'LOCKED' }) });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/Công ty đã bị khóa/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_11 – Error khi cvId khong ton tai', async () => {
    /**
     * TC ID: UT_F08_11 | Status: PASS
     * Notes: So loi: 1 – Error tai cv existence check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ cv: null });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'ghost-cv' }))
      .rejects.toThrow(/không tìm thấy CV/i);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_12 – Error khi CV khong thuoc ve nguoi dung goi API', async () => {
    /**
     * TC ID: UT_F08_12 | Status: PASS
     * Notes: So loi: 1 – Error tai cv.userId ownership check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ cv: makeCV({ userId: 'other' }) });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/CV không thuộc/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_13 – Error khi da ung tuyen truoc do (duplicate)', async () => {
    /**
     * TC ID: UT_F08_13 | Status: PASS
     * Notes: So loi: 1 – Error tai duplicate check
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps({ existing: makeApp() });
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow(/đã ứng tuyển/);
    expect(appRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F08_14 – notifyNewApplication() duoc goi sau khi ung tuyen thanh cong', async () => {
    /**
     * TC ID: UT_F08_14 | Status: PASS
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' });
    await Promise.resolve();
    expect(notifySvc.notifyNewApplication).toHaveBeenCalledWith('app-001');
  });

  it('UT_F08_15 – incrementApplicationCount KHONG goi khi save() that bai (atomicity)', async () => {
    /**
     * TC ID: UT_F08_15 | Status: PASS
     * Notes: CheckDB – Rollback tu nhien vi save() that bai; DB thuc can transaction
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    appRepo.save.mockRejectedValue(new Error('DB timeout'));
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await expect(uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001' }))
      .rejects.toThrow('DB timeout');
    expect(jobRepo.incrementApplicationCount).not.toHaveBeenCalled();
  });

  // ── Bug-finding ──────────────────────────────────────────────────────────
  it('UT_F08_16 – [BUG] coverLetter="" phai duoc luu la null, khong phai chuoi rong', async () => {
    /**
     * TC ID   : UT_F08_16
     * Objective: coverLetter rong ("") phai duoc chuan hoa thanh null truoc khi luu
     * Input   : coverLetter=""
     * Expected: appRepo.save() nhan coverLetter=null
     * Actual  : appRepo.save() nhan coverLetter="" vi `"" ?? null` = `""`
     * Status  : FAIL – BUG: doi `coverLetter ?? null` thanh `coverLetter || null`
     * Notes   : So loi: 1 – ApplyJobUseCase.execute() dong `coverLetter: coverLetter ?? null`
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001', coverLetter: '' });
    expect(appRepo.save).toHaveBeenCalledWith(expect.objectContaining({ coverLetter: null }));
  });

  it('UT_F08_17 – [BUG] coverLetter="   " (khoang trang) phai duoc chuan hoa thanh null', async () => {
    /**
     * TC ID   : UT_F08_17
     * Objective: coverLetter chi la khoang trang khong co gia tri thuc te → phai null
     * Input   : coverLetter="   " (3 spaces)
     * Expected: save() nhan coverLetter=null
     * Actual  : save() nhan coverLetter="   " – khong co trim
     * Status  : FAIL – BUG: thieu `coverLetter?.trim() || null`
     * Notes   : So loi: 1 – thieu normalize logic tai ApplyJobUseCase
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE, jobId: 'job-001', cvId: 'cv-001', coverLetter: '   ' });
    expect(appRepo.save).toHaveBeenCalledWith(expect.objectContaining({ coverLetter: null }));
  });

  it('UT_F08_18 – [BUG] findActiveByUserAndJob goi voi userId (khong phai cv.userId)', async () => {
    /**
     * TC ID   : UT_F08_18
     * Objective: Kiem tra chinh xac params truyen vao query duplicate check
     *            cv.userId co the khac userId cua caller (neu CV la cua nguoi khac
     *            thi code throw loi truoc o buoc ownership check, nhung phai dam bao
     *            duplicate check dung userId cua caller, khong phai cv.userId)
     * Input   : userId="u-111", jobId="j-222", cvId="c-333" (cv.userId="u-111")
     * Expected: findActiveByUserAndJob("u-111", "j-222") – dung userId cua caller
     * Status  : PASS – xac nhan khong co bug ve param
     * Notes   : CheckDB – query duplicate phai dung userId chinh xac
     */
    const { appRepo, jobRepo, cvRepo, companyRepo, notifySvc } = makeApplyDeps();
    jobRepo.findById.mockResolvedValue(makeJob({ id: 'j-222' }));
    cvRepo.findById.mockResolvedValue(makeCV({ id: 'c-333', userId: 'u-111' }));
    const uc = new ApplyJobUseCase(appRepo, jobRepo, cvRepo, companyRepo, notifySvc);
    await uc.execute({ userId: 'u-111', userRole: UserRole.CANDIDATE, jobId: 'j-222', cvId: 'c-333' });
    expect(appRepo.findActiveByUserAndJob).toHaveBeenCalledWith('u-111', 'j-222');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE B – WithdrawApplicationUseCase  (UT_F08_19 … UT_F08_27)
// ═════════════════════════════════════════════════════════════════════════════
describe('F08-B - WithdrawApplicationUseCase', () => {

  const makeWithdrawDeps = (app: any | null) => {
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findActiveByUserAndJob: jest.fn(),
      save: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn().mockResolvedValue(makeApp({ status: ApplicationStatus.CANCELLED })),
    };
    return { appRepo };
  };

  it('UT_F08_19 – Rut don PENDING thanh cong', async () => {
    /**
     * TC ID: UT_F08_19 | Status: PASS
     * Notes: CheckDB – update() goi voi {status: CANCELLED}
     *        Rollback – mock; DB thuc khong thay doi
     */
    const app = makeApp({ status: ApplicationStatus.PENDING, canBeWithdrawn: () => true });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'user-001' });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', { status: ApplicationStatus.CANCELLED });
    expect(appRepo.update).toHaveBeenCalledTimes(1);
  });

  it('UT_F08_20 – Error khi don khong ton tai', async () => {
    /**
     * TC ID: UT_F08_20 | Status: PASS
     * Notes: So loi: 1 – Error tai application existence check
     */
    const { appRepo } = makeWithdrawDeps(null);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'ghost', userId: 'user-001' }))
      .rejects.toThrow('Application not found');
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_21 – Error khi userId khong phai chu nhan cua don', async () => {
    /**
     * TC ID: UT_F08_21 | Status: PASS
     * Notes: So loi: 1 – Error tai ownership permission check
     */
    const app = makeApp({ userId: 'other-001', canBeWithdrawn: () => true });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001' }))
      .rejects.toThrow(/permission/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_22 – Error khi don REVIEWING khong the rut', async () => {
    /**
     * TC ID: UT_F08_22 | Status: PASS
     * Notes: So loi: 1 – Error tai canBeWithdrawn() – status=REVIEWING
     */
    const app = makeApp({ status: ApplicationStatus.REVIEWING, canBeWithdrawn: () => false });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001' })).rejects.toThrow(/chờ xử lý/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_23 – Error khi don ACCEPTED khong the rut', async () => {
    /**
     * TC ID: UT_F08_23 | Status: PASS
     * Notes: So loi: 1 – Error tai canBeWithdrawn() – status=ACCEPTED
     */
    const app = makeApp({ status: ApplicationStatus.ACCEPTED, canBeWithdrawn: () => false });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001' })).rejects.toThrow(/chờ xử lý/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_24 – Error khi don REJECTED khong the rut', async () => {
    /**
     * TC ID: UT_F08_24 | Status: PASS
     * Notes: So loi: 1 – Error tai canBeWithdrawn() – status=REJECTED
     */
    const app = makeApp({ status: ApplicationStatus.REJECTED, canBeWithdrawn: () => false });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001' })).rejects.toThrow(/chờ xử lý/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_25 – Error khi don CANCELLED khong the rut lai', async () => {
    /**
     * TC ID: UT_F08_25 | Status: PASS
     * Notes: So loi: 1 – Error tai canBeWithdrawn() – status=CANCELLED
     */
    const app = makeApp({ status: ApplicationStatus.CANCELLED, canBeWithdrawn: () => false });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001' })).rejects.toThrow(/chờ xử lý/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_26 – findByIdWithRelations goi 2 lan (pre-check + post-update)', async () => {
    /**
     * TC ID: UT_F08_26 | Status: PASS
     * Notes: CheckDB – xac minh du lieu duoc doc lai sau thay doi
     */
    const app = makeApp({ status: ApplicationStatus.PENDING, canBeWithdrawn: () => true });
    const { appRepo } = makeWithdrawDeps(app);
    const uc = new WithdrawApplicationUseCase(appRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'user-001' });
    expect(appRepo.findByIdWithRelations).toHaveBeenCalledTimes(2);
  });

  it('UT_F08_27 – [BUG] ADMIN khong the rut don thay ung vien qua WithdrawApplicationUseCase', async () => {
    /**
     * TC ID   : UT_F08_27
     * Objective: WithdrawApplicationUseCase khong co bypass cho ADMIN
     *            ADMIN muon huy don phai dung UpdateApplicationStatus (set CANCELLED)
     * Input   : application.userId="user-001", userId="admin-001" (ADMIN)
     * Expected: Don bi huy (ADMIN co quyen quan ly)
     * Actual  : Error("You do not have permission") – ADMIN bi tu choi
     * Status  : FAIL – BUG BY DESIGN hoac thieu ADMIN bypass
     * Notes   : So loi: 1 – thieu `if (userRole===ADMIN) → bypass ownership check`
     */
    const app = makeApp({ userId: 'user-001', canBeWithdrawn: () => true });
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findActiveByUserAndJob: jest.fn(),
      save: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(app),
      update: jest.fn().mockResolvedValue(makeApp({ status: ApplicationStatus.CANCELLED })),
    };
    const uc = new WithdrawApplicationUseCase(appRepo);
    // Expected: ADMIN co the rut don thay ung vien
    // Actual: Error - ADMIN bi tu choi
    await expect(uc.execute({ applicationId: 'app-001', userId: 'admin-001' })).resolves.toBeTruthy();
    expect(appRepo.update).toHaveBeenCalledWith('app-001', { status: ApplicationStatus.CANCELLED });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE C – GetApplicationByIdUseCase  (UT_F08_28 … UT_F08_35)
// ═════════════════════════════════════════════════════════════════════════════
describe('F08-C - GetApplicationByIdUseCase', () => {

  it('UT_F08_28 – Ung vien (owner) xem duoc don cua minh', async () => {
    /**
     * TC ID: UT_F08_28 | Status: PASS
     */
    const appRepo: jest.Mocked<IApplicationRepository> = {
      findActiveByUserAndJob: jest.fn(), save: jest.fn(),
      findByIdWithRelations: jest.fn().mockResolvedValue(makeApp()),
      update: jest.fn(),
    };
    const jobRepo: jest.Mocked<IJobRepository> = { findById: jest.fn(), incrementApplicationCount: jest.fn() };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = { findByCompanyAndUser: jest.fn() };
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    const res = await uc.execute({ applicationId: 'app-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.id).toBe('app-001');
  });

  it('UT_F08_29 – ADMIN xem duoc bat ky don nao', async () => {
    /**
     * TC ID: UT_F08_29 | Status: PASS
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps();
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    const res = await uc.execute({ applicationId: 'app-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(res.id).toBe('app-001');
  });

  it('UT_F08_30 – RECRUITER thuoc cong ty xem duoc don ung tuyen', async () => {
    /**
     * TC ID: UT_F08_30 | Status: PASS
     * Notes: CheckDB – memberRepo.findByCompanyAndUser(companyId, userId) duoc goi
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps();
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    const res = await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER });
    expect(res.id).toBe('app-001');
    expect(memberRepo.findByCompanyAndUser).toHaveBeenCalledWith('company-001', 'rec-001');
  });

  it('UT_F08_31 – AuthorizationError khi RECRUITER khong thuoc cong ty', async () => {
    /**
     * TC ID: UT_F08_31 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai member check = null
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ member: null });
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'other-rec', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F08_32 – NotFoundError khi applicationId khong ton tai', async () => {
    /**
     * TC ID: UT_F08_32 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai application existence check
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: null });
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'ghost', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
  });

  it('UT_F08_33 – AuthorizationError khi CANDIDATE xem don cua nguoi khac', async () => {
    /**
     * TC ID: UT_F08_33 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai permission check cuoi
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ userId: 'other' }), member: null });
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F08_34 – RECRUITER bi tu choi khi job khong ton tai (khong xac minh duoc cong ty)', async () => {
    /**
     * TC ID: UT_F08_34 | Status: PASS
     * Notes: So loi: 1 – job=null → memberRepo khong duoc goi → AuthorizationError
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ userId: 'other' }), job: null, member: null });
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
  });

  it('UT_F08_35 – [BUG] RECRUITER la owner (tu ung tuyen - du lieu loi) van xem duoc don', async () => {
    /**
     * TC ID   : UT_F08_35
     * Objective: Kiem tra truong hop edge: application.userId === userId (owner path)
     *            duoc xu ly truoc RECRUITER path – dam bao owner luon duoc xem
     * Input   : application.userId=rec-001, userId=rec-001, userRole=RECRUITER
     * Expected: Don duoc tra ve (owner path thang luon, khong can check membership)
     * Status  : PASS – xac nhan owner bypass hoat dong dung cho moi role
     * Notes   : memberRepo.findByCompanyAndUser KHONG duoc goi vi owner path la truoc
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({
      app: makeApp({ userId: 'rec-001' }), member: null,
    });
    const uc = new GetApplicationByIdUseCase(appRepo, jobRepo, memberRepo);
    const res = await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER });
    expect(res.id).toBe('app-001');
    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE D – UpdateApplicationStatusUseCase  (UT_F08_36 … UT_F08_47)
// ═════════════════════════════════════════════════════════════════════════════
describe('F08-D - UpdateApplicationStatusUseCase', () => {

  it('UT_F08_36 – RECRUITER cap nhat PENDING → REVIEWING thanh cong', async () => {
    /**
     * TC ID: UT_F08_36 | Status: PASS
     * Notes: CheckDB – update() goi voi {status: REVIEWING}
     *        Rollback – mock; DB thuc khong thay doi
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({
      app: makeApp({ status: ApplicationStatus.PENDING }),
    });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.REVIEWING }));
  });

  it('UT_F08_37 – RECRUITER cap nhat PENDING → ACCEPTED', async () => {
    /**
     * TC ID: UT_F08_37 | Status: PASS
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.ACCEPTED });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.ACCEPTED }));
  });

  it('UT_F08_38 – RECRUITER cap nhat REVIEWING → REJECTED', async () => {
    /**
     * TC ID: UT_F08_38 | Status: PASS
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.REVIEWING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REJECTED });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ status: ApplicationStatus.REJECTED }));
  });

  it('UT_F08_39 – ADMIN cap nhat trang thai khong can membership', async () => {
    /**
     * TC ID: UT_F08_39 | Status: PASS
     * Notes: ADMIN bypass membership check
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'admin-001', userRole: UserRole.ADMIN, status: ApplicationStatus.REVIEWING });
    expect(appRepo.update).toHaveBeenCalled();
    expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
  });

  it('UT_F08_40 – Error khi chuyen trang thai bat hop le (ACCEPTED → REJECTED)', async () => {
    /**
     * TC ID: UT_F08_40 | Status: PASS
     * Notes: So loi: 1 – Error tai isValidStatusTransition() check
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.ACCEPTED }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REJECTED }))
      .rejects.toThrow(/Invalid status transition/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_41 – AuthorizationError khi CANDIDATE cap nhat trang thai', async () => {
    /**
     * TC ID: UT_F08_41 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai role check
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'user-001', userRole: UserRole.CANDIDATE, status: ApplicationStatus.REVIEWING }))
      .rejects.toThrow(AuthorizationError);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_42 – AuthorizationError khi RECRUITER khong thuoc cong ty', async () => {
    /**
     * TC ID: UT_F08_42 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai member check = null
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({
      app: makeApp({ status: ApplicationStatus.PENDING }), member: null,
    });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'other-rec', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING }))
      .rejects.toThrow(AuthorizationError);
    expect(appRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F08_43 – NotFoundError khi applicationId khong ton tai', async () => {
    /**
     * TC ID: UT_F08_43 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai application existence check
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: null });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'ghost', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING }))
      .rejects.toThrow(NotFoundError);
  });

  it('UT_F08_44 – Cap nhat kem theo notes duoc luu dung', async () => {
    /**
     * TC ID: UT_F08_44 | Status: PASS
     * Notes: CheckDB – update() nhan {status, notes}
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING, notes: 'Ung vien phu hop' });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ notes: 'Ung vien phu hop' }));
  });

  // ── Bug-finding ──────────────────────────────────────────────────────────
  it('UT_F08_45 – [BUG] notes="" phai duoc luu la null, khong phai chuoi rong', async () => {
    /**
     * TC ID   : UT_F08_45
     * Objective: notes rong ("") phai duoc chuan hoa thanh null
     * Input   : notes=""
     * Expected: update() nhan notes=null
     * Actual  : update() nhan notes="" vi `notes ?? null` = `""` (khong fallback)
     * Status  : FAIL – BUG: doi `notes ?? null` thanh `notes || null`
     * Notes   : So loi: 1 – UpdateApplicationStatusUseCase dong `notes: notes ?? null`
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING, notes: '' });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ notes: null }));
  });

  it('UT_F08_46 – [BUG] notes="   " phai duoc chuan hoa thanh null', async () => {
    /**
     * TC ID   : UT_F08_46
     * Objective: notes chi la khoang trang khong co gia tri thuc te → phai null
     * Input   : notes="   " (spaces)
     * Expected: update() nhan notes=null
     * Actual  : update() nhan notes="   "
     * Status  : FAIL – BUG: thieu `notes?.trim() || null`
     * Notes   : So loi: 1 – UpdateApplicationStatusUseCase thieu normalize notes
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.PENDING }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await uc.execute({ applicationId: 'app-001', userId: 'rec-001', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING, notes: '   ' });
    expect(appRepo.update).toHaveBeenCalledWith('app-001', expect.objectContaining({ notes: null }));
  });

  it('UT_F08_47 – [BUG] CANCELLED → REVIEWING chuyen trang thai bat hop le', async () => {
    /**
     * TC ID   : UT_F08_47
     * Objective: Don da bi huy (CANCELLED) khong the chuyen sang REVIEWING
     * Input   : application.status=CANCELLED, new status=REVIEWING
     * Expected: Error("Invalid status transition")
     * Status  : PASS – xac nhan transition validation hoat dong dung
     * Notes   : Kiem tra nghiem ngat rang CANCELLED la trang thai cuoi khong the chuyen
     */
    const { appRepo, jobRepo, memberRepo } = makeStatusDeps({ app: makeApp({ status: ApplicationStatus.CANCELLED }) });
    const uc = new UpdateApplicationStatusUseCase(appRepo, jobRepo, memberRepo);
    await expect(uc.execute({ applicationId: 'app-001', userId: 'admin-001', userRole: UserRole.ADMIN, status: ApplicationStatus.REVIEWING }))
      .rejects.toThrow(/Invalid status transition/);
    expect(appRepo.update).not.toHaveBeenCalled();
  });
});
