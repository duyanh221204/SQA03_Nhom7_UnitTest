/**
 * @file    F07_coverage.test.ts
 * @purpose Đo code coverage cho src/F07/CVUseCases.ts
 *          Chạy lệnh:  npx jest coverage-tests/F07_coverage --coverage
 */
import {
  UserRole,
  NotFoundError, ValidationError, AuthorizationError, ConflictError,
  CreateCVUseCase, GetCVsByUserUseCase, GetCVByIdUseCase,
  UpdateCVUseCase, DeleteCVUseCase, SetMainCVUseCase,
} from '../src/F07/CVUseCases';

// ─── Mock factories ───────────────────────────────────────────────────────────
const mockUser = (id = 'u1') => ({ id, email: 'a@b.com' });
const mockCV   = (id = 'cv1', userId = 'u1', extra: any = {}) => ({
  id, userId, title: 'My CV', isMain: false, templateId: null, createdAt: new Date(), ...extra,
});
const mockTemplate = (id = 'tpl1', isActive = true) => ({ id, isActive });

const makeCV = (overrides: any = {}): any => ({
  save: jest.fn().mockResolvedValue(mockCV()),
  findById: jest.fn().mockResolvedValue(mockCV()),
  findByIdWithRelations: jest.fn().mockResolvedValue(mockCV()),
  countByUserId: jest.fn().mockResolvedValue(0),
  unsetMainForUser: jest.fn().mockResolvedValue(undefined),
  findByUserId: jest.fn().mockResolvedValue([mockCV()]),
  update: jest.fn().mockResolvedValue(mockCV()),
  delete: jest.fn().mockResolvedValue(undefined),
  hasApplications: jest.fn().mockResolvedValue(false),
  ...overrides,
});
const makeUser = (ret: any = mockUser()) => ({ findById: jest.fn().mockResolvedValue(ret) });
const makeTpl  = (ret: any = mockTemplate()) => ({ findById: jest.fn().mockResolvedValue(ret) });
const makeFile = () => ({ uploadFile: jest.fn().mockResolvedValue('https://cdn.test/cv.pdf') });
const makePDF  = () => ({ renderTemplate: jest.fn().mockReturnValue('<html/>'), generatePDF: jest.fn().mockResolvedValue(Buffer.from('')) });

// ═══════════════════════════════════════════════════════════════════════════════
// A. CreateCVUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('CreateCVUseCase', () => {
  it('tạo CV đầu tiên thành công (isMain tự động = true)', async () => {
    const cvR = makeCV(); const uR = makeUser(); const tR = makeTpl(); const fS = makeFile(); const pS = makePDF();
    const uc = new CreateCVUseCase(cvR, uR, tR, fS, pS);
    await uc.execute({ userId: 'u1', title: 'CV mới' });
    expect(cvR.unsetMainForUser).toHaveBeenCalledWith('u1');
    expect(cvR.save).toHaveBeenCalled();
  });
  it('lỗi khi user không tồn tại', async () => {
    const uc = new CreateCVUseCase(makeCV(), makeUser(null), makeTpl(), makeFile(), makePDF());
    await expect(uc.execute({ userId: 'x', title: 'X' })).rejects.toThrow(NotFoundError);
  });
  it('lỗi email sai định dạng', async () => {
    const uc = new CreateCVUseCase(makeCV(), makeUser(), makeTpl(), makeFile(), makePDF());
    await expect(uc.execute({ userId: 'u1', title: 'CV', email: 'bad-email' })).rejects.toThrow(ValidationError);
  });
  it('lỗi khi templateId không tồn tại', async () => {
    const uc = new CreateCVUseCase(makeCV(), makeUser(), makeUser(null) as any, makeFile(), makePDF());
    await expect(uc.execute({ userId: 'u1', title: 'CV', templateId: 'tpl-not-found' })).rejects.toThrow(NotFoundError);
  });
  it('lỗi khi template inactive', async () => {
    const uc = new CreateCVUseCase(makeCV(), makeUser(), makeTpl(mockTemplate('t', false)), makeFile(), makePDF());
    await expect(uc.execute({ userId: 'u1', title: 'CV', templateId: 'tpl1' })).rejects.toThrow(ValidationError);
  });
  it('CV thứ 2 trở đi: isMain chỉ đặt khi isMain=true', async () => {
    const cvR = makeCV({ countByUserId: jest.fn().mockResolvedValue(2) });
    const uc = new CreateCVUseCase(cvR, makeUser(), makeTpl(), makeFile(), makePDF());
    await uc.execute({ userId: 'u1', title: 'CV2', isMain: false });
    expect(cvR.unsetMainForUser).not.toHaveBeenCalled();
  });
  it('tạo CV với template hợp lệ: sinh PDF', async () => {
    const cvR = makeCV(); const fS = makeFile(); const pS = makePDF();
    const uc = new CreateCVUseCase(cvR, makeUser(), makeTpl(), fS, pS);
    await uc.execute({ userId: 'u1', title: 'CV PDF', templateId: 'tpl1' });
    expect(pS.generatePDF).toHaveBeenCalled();
    expect(fS.uploadFile).toHaveBeenCalled();
    expect(cvR.update).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. GetCVsByUserUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('GetCVsByUserUseCase', () => {
  const make = (cvs: any[] = [mockCV()], user: any = mockUser()) =>
    new GetCVsByUserUseCase(makeCV({ findByUserId: jest.fn().mockResolvedValue(cvs) }), makeUser(user));
  it('chủ sở hữu xem được', async () => {
    const { cvs } = await make().execute({ userId: 'u1', targetUserId: 'u1', userRole: UserRole.CANDIDATE });
    expect(cvs).toHaveLength(1);
  });
  it('ADMIN xem được CV người khác', async () => {
    const { cvs } = await make().execute({ userId: 'admin1', targetUserId: 'u1', userRole: UserRole.ADMIN });
    expect(cvs).toHaveLength(1);
  });
  it('RECRUITER xem được CV người khác', async () => {
    const { cvs } = await make().execute({ userId: 'r1', targetUserId: 'u1', userRole: UserRole.RECRUITER });
    expect(cvs).toHaveLength(1);
  });
  it('CANDIDATE khác không được xem', async () => {
    await expect(make().execute({ userId: 'other', targetUserId: 'u1', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
  it('targetUser không tồn tại -> NotFoundError', async () => {
    await expect(make([], null).execute({ userId: 'u1', targetUserId: 'unknown', userRole: UserRole.ADMIN }))
      .rejects.toThrow(NotFoundError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. GetCVByIdUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('GetCVByIdUseCase', () => {
  const make = (cv: any) => new GetCVByIdUseCase({ findByIdWithRelations: jest.fn().mockResolvedValue(cv) } as any);
  it('chủ sở hữu lấy được CV', async () => {
    const cv = mockCV('cv1', 'u1');
    const res = await make(cv).execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE });
    expect(res.id).toBe('cv1');
  });
  it('CV không tồn tại -> NotFoundError', async () => {
    await expect(make(null).execute({ cvId: 'x', userId: 'u1', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
  });
  it('RECRUITER xem CV isOpenForJob=true', async () => {
    const cv = mockCV('cv1', 'u1', { isOpenForJob: true });
    const res = await make(cv).execute({ cvId: 'cv1', userId: 'r1', userRole: UserRole.RECRUITER });
    expect(res).toBeDefined();
  });
  it('RECRUITER bị từ chối khi CV không public', async () => {
    const cv = mockCV('cv1', 'u1', { isOpenForJob: false });
    await expect(make(cv).execute({ cvId: 'cv1', userId: 'r1', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
  });
  it('ADMIN luôn xem được', async () => {
    const cv = mockCV('cv1', 'u1', { isOpenForJob: false });
    const res = await make(cv).execute({ cvId: 'cv1', userId: 'admin', userRole: UserRole.ADMIN });
    expect(res).toBeDefined();
  });
  it('CANDIDATE khác bị từ chối', async () => {
    await expect(make(mockCV()).execute({ cvId: 'cv1', userId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. UpdateCVUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('UpdateCVUseCase', () => {
  const make = (cvOver: any = {}, tplOver: any = {}) =>
    new UpdateCVUseCase(makeCV(cvOver), makeTpl(tplOver) as any, makeFile(), makePDF());
  it('cập nhật title thành công', async () => {
    const uc = make();
    await uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE, title: 'New' });
  });
  it('lỗi CV không tồn tại', async () => {
    const uc = make({ findById: jest.fn().mockResolvedValue(null) });
    await expect(uc.execute({ cvId: 'x', userId: 'u1', userRole: UserRole.CANDIDATE })).rejects.toThrow(NotFoundError);
  });
  it('lỗi người dùng khác không được update', async () => {
    const uc = make();
    await expect(uc.execute({ cvId: 'cv1', userId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
  it('lỗi email sai định dạng', async () => {
    const uc = make();
    await expect(uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE, email: 'bad' }))
      .rejects.toThrow(ValidationError);
  });
  it('set isMain=true: gọi unsetMainForUser', async () => {
    const cvR = makeCV(); const uc = new UpdateCVUseCase(cvR, makeTpl() as any, makeFile(), makePDF());
    await uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE, isMain: true });
    expect(cvR.unsetMainForUser).toHaveBeenCalledWith('u1');
  });
  it('ADMIN có thể cập nhật CV người khác', async () => {
    const uc = make();
    await expect(uc.execute({ cvId: 'cv1', userId: 'admin', userRole: UserRole.ADMIN, title: 'New' }))
      .resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. DeleteCVUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('DeleteCVUseCase', () => {
  it('xóa CV không có đơn ứng tuyển thành công', async () => {
    const cvR = makeCV(); const uc = new DeleteCVUseCase(cvR);
    const r = await uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE });
    expect(r.success).toBe(true);
    expect(cvR.delete).toHaveBeenCalledWith('cv1');
  });
  it('CV không tồn tại -> NotFoundError', async () => {
    const uc = new DeleteCVUseCase(makeCV({ findById: jest.fn().mockResolvedValue(null) }));
    await expect(uc.execute({ cvId: 'x', userId: 'u1', userRole: UserRole.CANDIDATE })).rejects.toThrow(NotFoundError);
  });
  it('người khác không được xóa -> AuthorizationError', async () => {
    const uc = new DeleteCVUseCase(makeCV());
    await expect(uc.execute({ cvId: 'cv1', userId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
  it('CV có đơn ứng tuyển -> ConflictError', async () => {
    const uc = new DeleteCVUseCase(makeCV({ hasApplications: jest.fn().mockResolvedValue(true) }));
    await expect(uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(ConflictError);
  });
  it('xóa CV isMain -> chuyển main sang CV cũ nhất còn lại', async () => {
    const cv2 = mockCV('cv2', 'u1', { createdAt: new Date('2024-01-01') });
    const cv1main = mockCV('cv1', 'u1', { isMain: true, createdAt: new Date('2024-06-01') });
    const cvR = makeCV({
      findById: jest.fn().mockResolvedValue(cv1main),
      findByUserId: jest.fn().mockResolvedValue([cv1main, cv2]),
    });
    const uc = new DeleteCVUseCase(cvR);
    await uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE });
    expect(cvR.update).toHaveBeenCalledWith('cv2', { isMain: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. SetMainCVUseCase
// ═══════════════════════════════════════════════════════════════════════════════
describe('SetMainCVUseCase', () => {
  it('đặt CV thành main thành công', async () => {
    const cvR = makeCV(); const uc = new SetMainCVUseCase(cvR);
    await uc.execute({ cvId: 'cv1', userId: 'u1', userRole: UserRole.CANDIDATE });
    expect(cvR.unsetMainForUser).toHaveBeenCalledWith('u1');
    expect(cvR.update).toHaveBeenCalledWith('cv1', { isMain: true });
  });
  it('CV không tồn tại -> NotFoundError', async () => {
    const uc = new SetMainCVUseCase(makeCV({ findById: jest.fn().mockResolvedValue(null) }));
    await expect(uc.execute({ cvId: 'x', userId: 'u1', userRole: UserRole.CANDIDATE })).rejects.toThrow(NotFoundError);
  });
  it('người khác không được set main', async () => {
    const uc = new SetMainCVUseCase(makeCV());
    await expect(uc.execute({ cvId: 'cv1', userId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });
  it('ADMIN có thể set main CV người khác', async () => {
    const uc = new SetMainCVUseCase(makeCV());
    await expect(uc.execute({ cvId: 'cv1', userId: 'admin', userRole: UserRole.ADMIN })).resolves.toBeDefined();
  });
});
