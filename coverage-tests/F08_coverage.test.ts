/**
 * @file    F08_coverage.test.ts
 * @purpose Đo code coverage cho src/F08/ApplicationUseCases.ts
 *          Chạy lệnh:  npx jest coverage-tests/F08_coverage --coverage
 */
import {
  UserRole, ApplicationStatus,
  AuthorizationError, NotFoundError,
  ApplyJobUseCase, WithdrawApplicationUseCase,
  GetApplicationByIdUseCase, UpdateApplicationStatusUseCase,
} from '../src/F08/ApplicationUseCases';

// ─── Mock factories ───────────────────────────────────────────────────────────
const mockApp = (id = 'app1', userId = 'u1', status = ApplicationStatus.PENDING, extra: any = {}) => ({
  id, userId, jobId: 'job1', cvId: 'cv1', status,
  canBeWithdrawn: () => status === ApplicationStatus.PENDING,
  ...extra,
});
const mockJob     = (id = 'job1', extra: any = {}) => ({
  id, companyId: 'co1', status: 'ACTIVE',
  isExpired: () => false, isActive: () => true, ...extra,
});
const mockCompany = (id = 'co1', extra: any = {}) => ({ id, status: 'ACTIVE', ...extra });

const makeAppRepo = (over: any = {}) => ({
  findActiveByUserAndJob: jest.fn().mockResolvedValue(null),
  save:                   jest.fn().mockResolvedValue(mockApp()),
  findByIdWithRelations:  jest.fn().mockResolvedValue(mockApp()),
  update:                 jest.fn().mockResolvedValue(mockApp()),
  ...over,
});
const makeJobRepo  = (ret: any = mockJob()) => ({
  findById:                 jest.fn().mockResolvedValue(ret),
  incrementApplicationCount: jest.fn().mockResolvedValue(undefined),
});
const makeCVRepo   = (ret: any = { id: 'cv1', userId: 'u1' }) => ({ findById: jest.fn().mockResolvedValue(ret) });
const makeCoRepo   = (ret: any = mockCompany()) => ({ findById: jest.fn().mockResolvedValue(ret) });
const makeMemRepo  = (ret: any = { id: 'm1' }) => ({
  findByCompanyAndUser: jest.fn().mockResolvedValue(ret),
});
const makeNotify   = () => ({ notifyNewApplication: jest.fn().mockResolvedValue(undefined) });

// ═══════════════════════════════════════════════════════════════════════════════
// A. ApplyJobUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('ApplyJobUseCase', () => {
  const make = (aR = makeAppRepo(), jR = makeJobRepo(), cR = makeCVRepo(), coR = makeCoRepo(), nS = makeNotify()) =>
    new ApplyJobUseCase(aR, jR, cR, coR, nS);
  const validInput = { userId: 'u1', userRole: UserRole.CANDIDATE, jobId: 'job1', cvId: 'cv1' };
  it('nộp đơn thành công', async () => {
    await expect(make().execute(validInput)).resolves.toBeDefined();
  });
  it('chỉ CANDIDATE được nộp đơn', async () => {
    await expect(make().execute({ ...validInput, userRole: UserRole.RECRUITER })).rejects.toThrow(AuthorizationError);
  });
  it('job không tồn tại', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(null)).execute(validInput)).rejects.toThrow();
  });
  it('job đã bị khóa (LOCKED)', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(mockJob('j1', { status: 'LOCKED' }))).execute(validInput)).rejects.toThrow();
  });
  it('job INACTIVE', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(mockJob('j1', { status: 'INACTIVE' }))).execute(validInput)).rejects.toThrow();
  });
  it('job hết hạn', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(mockJob('j1', { isExpired: () => true, isActive: () => false }))).execute(validInput)).rejects.toThrow();
  });
  it('công ty bị khóa', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(), makeCVRepo(), makeCoRepo(mockCompany('co1', { status: 'LOCKED' }))).execute(validInput)).rejects.toThrow();
  });
  it('CV không tồn tại', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(), makeCVRepo(null)).execute(validInput)).rejects.toThrow();
  });
  it('CV không thuộc user', async () => {
    await expect(make(makeAppRepo(), makeJobRepo(), makeCVRepo({ id: 'cv1', userId: 'other' })).execute(validInput)).rejects.toThrow();
  });
  it('đã nộp đơn rồi -> báo lỗi', async () => {
    await expect(make(makeAppRepo({ findActiveByUserAndJob: jest.fn().mockResolvedValue(mockApp()) })).execute(validInput)).rejects.toThrow();
  });
  it('gọi incrementApplicationCount sau khi nộp', async () => {
    const jR = makeJobRepo();
    await make(makeAppRepo(), jR).execute(validInput);
    expect(jR.incrementApplicationCount).toHaveBeenCalledWith('job1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. WithdrawApplicationUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('WithdrawApplicationUseCase', () => {
  const make = (app: any) =>
    new WithdrawApplicationUseCase({ findByIdWithRelations: jest.fn().mockResolvedValue(app), update: jest.fn().mockResolvedValue(app) } as any);
  it('rút đơn PENDING thành công', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'u1' })).resolves.toBeDefined();
  });
  it('không tìm thấy đơn', async () => {
    await expect(make(null).execute({ applicationId: 'x', userId: 'u1' })).rejects.toThrow();
  });
  it('người khác không được rút', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'other' })).rejects.toThrow();
  });
  it('đơn ACCEPTED không thể rút', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.ACCEPTED)).execute({ applicationId: 'app1', userId: 'u1' }))
      .rejects.toThrow();
  });
  it('đơn REJECTED không thể rút', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.REJECTED)).execute({ applicationId: 'app1', userId: 'u1' }))
      .rejects.toThrow();
  });
  it('đơn REVIEWING không thể rút', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.REVIEWING)).execute({ applicationId: 'app1', userId: 'u1' }))
      .rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. GetApplicationByIdUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('GetApplicationByIdUseCase', () => {
  const make = (app: any, jobRet = mockJob(), memRet: any = { id: 'm1' }) =>
    new GetApplicationByIdUseCase(
      { findByIdWithRelations: jest.fn().mockResolvedValue(app) } as any,
      makeJobRepo(jobRet),
      makeMemRepo(memRet),
    );
  it('chủ đơn xem được', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'u1', userRole: UserRole.CANDIDATE }))
      .resolves.toBeDefined();
  });
  it('đơn không tồn tại', async () => {
    await expect(make(null).execute({ applicationId: 'x', userId: 'u1', userRole: UserRole.ADMIN }))
      .rejects.toThrow(NotFoundError);
  });
  it('ADMIN xem được', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'admin', userRole: UserRole.ADMIN }))
      .resolves.toBeDefined();
  });
  it('RECRUITER thuộc công ty xem được', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'r1', userRole: UserRole.RECRUITER }))
      .resolves.toBeDefined();
  });
  it('RECRUITER không thuộc công ty bị từ chối', async () => {
    await expect(make(mockApp(), mockJob(), null).execute({ applicationId: 'app1', userId: 'r2', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
  });
  it('CANDIDATE khác bị từ chối', async () => {
    await expect(make(mockApp()).execute({ applicationId: 'app1', userId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. UpdateApplicationStatusUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('UpdateApplicationStatusUseCase', () => {
  const make = (app: any, jobRet = mockJob(), memRet: any = { id: 'm1' }) =>
    new UpdateApplicationStatusUseCase(
      makeAppRepo({ findByIdWithRelations: jest.fn().mockResolvedValue(app) }),
      makeJobRepo(jobRet),
      makeMemRepo(memRet),
    );
  const validR = { applicationId: 'app1', userId: 'r1', userRole: UserRole.RECRUITER, status: ApplicationStatus.REVIEWING };
  it('RECRUITER thuộc công ty -> chuyển PENDING->REVIEWING', async () => {
    await expect(make(mockApp()).execute(validR)).resolves.toBeDefined();
  });
  it('đơn không tồn tại -> NotFoundError', async () => {
    await expect(make(null).execute(validR)).rejects.toThrow(NotFoundError);
  });
  it('CANDIDATE không được update status', async () => {
    await expect(make(mockApp()).execute({ ...validR, userRole: UserRole.CANDIDATE })).rejects.toThrow(AuthorizationError);
  });
  it('RECRUITER không thuộc công ty -> AuthorizationError', async () => {
    await expect(make(mockApp(), mockJob(), null).execute(validR)).rejects.toThrow(AuthorizationError);
  });
  it('chuyển trạng thái không hợp lệ ACCEPTED->PENDING', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.ACCEPTED)).execute({
      ...validR, status: ApplicationStatus.PENDING,
    })).rejects.toThrow();
  });
  it('chuyển ACCEPTED->REJECTED không được', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.ACCEPTED)).execute({
      ...validR, status: ApplicationStatus.REJECTED,
    })).rejects.toThrow();
  });
  it('REVIEWING->ACCEPTED hợp lệ', async () => {
    await expect(make(mockApp('app1', 'u1', ApplicationStatus.REVIEWING)).execute({
      ...validR, status: ApplicationStatus.ACCEPTED,
    })).resolves.toBeDefined();
  });
  it('ADMIN update không cần check company', async () => {
    await expect(make(mockApp(), mockJob(), null).execute({
      ...validR, userId: 'admin', userRole: UserRole.ADMIN,
    })).resolves.toBeDefined();
  });
  it('chuyển PENDING->CANCELLED', async () => {
    await expect(make(mockApp()).execute({ ...validR, status: ApplicationStatus.CANCELLED })).resolves.toBeDefined();
  });
});
