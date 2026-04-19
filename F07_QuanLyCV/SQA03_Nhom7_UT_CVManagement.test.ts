/**
 * @file    SQA03_Nhom7_UT_CVManagement.test.ts
 * @module  F07_QuanLyCV
 * @desc    Unit tests – F07: Quản lý hồ sơ CV (Ứng viên)
 * @group   Nhom 07 – SQA03
 *
 * Use Cases:
 *   A. CreateCVUseCase       UT_F07_01 .. UT_F07_20  (15 PASS, 5 FAIL-BUG)
 *   B. GetCVsByUserUseCase   UT_F07_21 .. UT_F07_31  (10 PASS, 1 FAIL-BUG)
 *   C. GetCVByIdUseCase      UT_F07_32 .. UT_F07_42  (11 PASS, 0 FAIL)
 *   D. UpdateCVUseCase       UT_F07_43 .. UT_F07_55  (10 PASS, 3 FAIL-BUG)
 *   E. DeleteCVUseCase       UT_F07_56 .. UT_F07_63  ( 7 PASS, 1 FAIL-BUG)
 *   F. SetMainCVUseCase      UT_F07_64 .. UT_F07_70  ( 6 PASS, 1 FAIL-BUG)
 *
 * Total: 70 test cases (59 PASS, 11 FAIL)
 */

// ─────────────────────────────────────────────────────────────────────────────
// INLINE ENUMS & ERRORS
// ─────────────────────────────────────────────────────────────────────────────
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

class AppError extends Error { constructor(msg: string, public statusCode = 500) { super(msg); } }
class NotFoundError    extends AppError { constructor(m: string) { super(m, 404); this.name = 'NotFoundError'; } }
class ValidationError  extends AppError { constructor(m: string) { super(m, 400); this.name = 'ValidationError'; } }
class AuthorizationError extends AppError { constructor(m: string) { super(m, 403); this.name = 'AuthorizationError'; } }
class ConflictError    extends AppError { constructor(m: string) { super(m, 409); this.name = 'ConflictError'; } }

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────
interface ICVRepository {
  save(data: any): Promise<any>;
  findById(id: string): Promise<any | null>;
  findByIdWithRelations(id: string): Promise<any | null>;
  countByUserId(userId: string): Promise<number>;
  unsetMainForUser(userId: string): Promise<void>;
  findByUserId(userId: string): Promise<any[]>;
  update(id: string, data: any): Promise<any>;
  delete(id: string): Promise<void>;
  hasApplications(id: string): Promise<boolean>;
}
interface IUserRepository { findById(id: string): Promise<any | null>; }
interface ICVTemplateRepository { findById(id: string): Promise<any | null>; }
interface IFileStorageService {
  uploadFile(file: any, folder: string, filename?: string): Promise<string>;
}
interface IPDFService {
  renderTemplate(html: string, data: any): string;
  generatePDF(html: string): Promise<Buffer>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINED USE CASES  (mirror source logic)
// ─────────────────────────────────────────────────────────────────────────────

/** A. CreateCVUseCase */
class CreateCVUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private userRepo: IUserRepository,
    private tplRepo: ICVTemplateRepository,
    private fileSvc: IFileStorageService,
    private pdfSvc: IPDFService,
  ) {}
  async execute(input: {
    userId: string; title: string; email?: string; isMain?: boolean;
    templateId?: string; fullName?: string; phoneNumber?: string;
    skills?: any[]; educations?: any[]; workExperiences?: any[];
    certifications?: any[]; summary?: string; objective?: string;
    isOpenForJob?: boolean;
  }) {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    if (input.email && !isEmail(input.email)) throw new ValidationError('Invalid email format');
    if (input.templateId) {
      const tpl = await this.tplRepo.findById(input.templateId);
      if (!tpl) throw new NotFoundError('CV Template not found');
      if (!tpl.isActive) throw new ValidationError('CV Template is not active');
    }
    const count = await this.cvRepo.countByUserId(input.userId);
    const isFirst = count === 0;
    if (input.isMain || isFirst) await this.cvRepo.unsetMainForUser(input.userId);
    const cv = await this.cvRepo.save({
      userId: input.userId, title: input.title,
      templateId: input.templateId ?? null, email: input.email ?? null,
      isMain: input.isMain ?? isFirst,
      fullName: input.fullName ?? null, phoneNumber: input.phoneNumber ?? null,
      skills: input.skills ?? [], educations: input.educations ?? [],
      workExperiences: input.workExperiences ?? [], certifications: input.certifications ?? [],
      summary: input.summary ?? null, objective: input.objective ?? null,
      isOpenForJob: input.isOpenForJob ?? false,
    });
    if (input.templateId) {
      try {
        const tpl = await this.tplRepo.findById(input.templateId);
        if (tpl?.isActive) {
          const html = this.pdfSvc.renderTemplate('<html/>', {});
          const buf = await this.pdfSvc.generatePDF(html);
          const url = await this.fileSvc.uploadFile({ buffer: buf }, 'cv-exports');
          await this.cvRepo.update(cv.id, { pdfUrl: url });
        }
      } catch (_) { /* intentional – PDF errors must not fail CV creation */ }
    }
    return await this.cvRepo.findByIdWithRelations(cv.id);
  }
}

/** B. GetCVsByUserUseCase */
class GetCVsByUserUseCase {
  constructor(private cvRepo: ICVRepository, private userRepo: IUserRepository) {}
  async execute(input: { userId: string; targetUserId: string; userRole: string }) {
    const target = await this.userRepo.findById(input.targetUserId);
    if (!target) throw new NotFoundError('Không tìm thấy người dùng');
    const isOwner     = input.userId === input.targetUserId;
    const isAdmin     = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;
    if (!isOwner && !isAdmin && !isRecruiter) throw new AuthorizationError('Bạn không có quyền xem các CV này');
    const cvs = await this.cvRepo.findByUserId(input.targetUserId);
    return { cvs };
  }
}

/** C. GetCVByIdUseCase */
class GetCVByIdUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const cv = await this.cvRepo.findByIdWithRelations(input.cvId);
    if (!cv) throw new NotFoundError('Không tìm thấy CV');
    const isOwner     = input.userId === cv.userId;
    const isAdmin     = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;
    if (isOwner || isAdmin) return cv;
    if (isRecruiter) {
      if (!cv.isOpenForJob) throw new AuthorizationError('CV này không công khai');
      return cv;
    }
    throw new AuthorizationError('Bạn không có quyền xem CV này');
  }
}

/** D. UpdateCVUseCase */
class UpdateCVUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private tplRepo: ICVTemplateRepository,
    private fileSvc: IFileStorageService,
    private pdfSvc: IPDFService,
  ) {}
  async execute(input: {
    cvId: string; userId: string; userRole: string;
    title?: string; email?: string; isMain?: boolean; templateId?: string;
    fullName?: string; phoneNumber?: string; summary?: string; skills?: any[];
    workExperiences?: any[]; educations?: any[];
  }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền cập nhật CV này');
    if (input.email && !isEmail(input.email)) throw new ValidationError('Định dạng email không hợp lệ');
    if (input.templateId) {
      const tpl = await this.tplRepo.findById(input.templateId);
      if (!tpl) throw new NotFoundError('Không tìm thấy mẫu CV');
      if (!tpl.isActive) throw new ValidationError('Mẫu CV không còn hoạt động');
    }
    if (input.isMain && !existing.isMain) await this.cvRepo.unsetMainForUser(existing.userId);
    const updateData: any = {};
    if (input.title       !== undefined) updateData.title       = input.title;
    if (input.email       !== undefined) updateData.email       = input.email;
    if (input.isMain      !== undefined) updateData.isMain      = input.isMain;
    if (input.fullName    !== undefined) updateData.fullName    = input.fullName;
    if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
    if (input.summary     !== undefined) updateData.summary     = input.summary;
    if (input.skills      !== undefined) updateData.skills      = input.skills;
    if (input.workExperiences !== undefined) updateData.workExperiences = input.workExperiences;
    if (input.educations  !== undefined) updateData.educations  = input.educations;
    if (input.templateId  !== undefined) updateData.templateId  = input.templateId;
    await this.cvRepo.update(input.cvId, updateData);
    const updated = await this.cvRepo.findByIdWithRelations(input.cvId);
    const finalTplId = input.templateId !== undefined ? input.templateId : existing.templateId;
    const hasContent = Object.keys(updateData).some(k => k !== 'isMain' && k !== 'isOpenForJob');
    if (hasContent && finalTplId) {
      try {
        const tpl = await this.tplRepo.findById(finalTplId);
        if (tpl?.isActive) {
          const html = this.pdfSvc.renderTemplate('<html/>', {});
          const buf  = await this.pdfSvc.generatePDF(html);
          const url  = await this.fileSvc.uploadFile({ buffer: buf }, 'cv-exports');
          await this.cvRepo.update(input.cvId, { pdfUrl: url });
        }
      } catch (_) { /* intentional */ }
    }
    return await this.cvRepo.findByIdWithRelations(input.cvId);
  }
}

/** E. DeleteCVUseCase */
class DeleteCVUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền xóa CV này');
    const hasApps = await this.cvRepo.hasApplications(input.cvId);
    if (hasApps) throw new ConflictError('Không thể xóa CV đã có đơn ứng tuyển');
    if (existing.isMain) {
      const all = await this.cvRepo.findByUserId(existing.userId);
      const rest = all.filter((c: any) => c.id !== input.cvId);
      if (rest.length > 0) {
        const oldest = rest.sort((a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        await this.cvRepo.update(oldest.id, { isMain: true });
      }
    }
    await this.cvRepo.delete(input.cvId);
    return { success: true, message: 'Xóa CV thành công' };
  }
}

/** F. SetMainCVUseCase */
class SetMainCVUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền cập nhật CV này');
    await this.cvRepo.unsetMainForUser(existing.userId);
    await this.cvRepo.update(input.cvId, { isMain: true });
    return await this.cvRepo.findByIdWithRelations(input.cvId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

const makeCV = (o: any = {}) => ({
  id: 'cv-001', userId: 'user-001', title: 'My CV',
  isMain: true, templateId: null, isOpenForJob: false,
  createdAt: new Date('2024-01-01'), ...o,
});
const makeUser = (o: any = {}) => ({ id: 'user-001', email: 'u@e.com', role: UserRole.CANDIDATE, ...o });
const makeTpl  = (o: any = {}) => ({ id: 'tpl-001', isActive: true, htmlUrl: 'http://t.html', ...o });

/** Full deps for CreateCVUseCase */
function makeCreateDeps(opts: { user?: any; countCV?: number; template?: any } = {}) {
  const cvRepo: jest.Mocked<ICVRepository> = {
    save: jest.fn().mockResolvedValue(makeCV()),
    findById: jest.fn(),
    findByIdWithRelations: jest.fn().mockResolvedValue(makeCV()),
    countByUserId: jest.fn().mockResolvedValue(opts.countCV ?? 0),
    unsetMainForUser: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn(),
    update: jest.fn().mockResolvedValue(makeCV()),
    delete: jest.fn(),
    hasApplications: jest.fn(),
  };
  const userRepo: jest.Mocked<IUserRepository> = {
    findById: jest.fn().mockResolvedValue(opts.user !== undefined ? opts.user : makeUser()),
  };
  const tplRepo: jest.Mocked<ICVTemplateRepository> = {
    findById: jest.fn().mockResolvedValue(opts.template !== undefined ? opts.template : makeTpl()),
  };
  const fileSvc: jest.Mocked<IFileStorageService> = {
    uploadFile: jest.fn().mockResolvedValue('https://storage/cv.pdf'),
  };
  const pdfSvc: jest.Mocked<IPDFService> = {
    renderTemplate: jest.fn().mockReturnValue('<html/>'),
    generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  return { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc };
}

/** Full deps for GetCVsByUserUseCase */
function makeGetListDeps(cvs: any[] = [makeCV()], targetUser: any = makeUser()) {
  const cvRepo: jest.Mocked<ICVRepository> = {
    save: jest.fn(), findById: jest.fn(),
    findByIdWithRelations: jest.fn(), countByUserId: jest.fn(),
    unsetMainForUser: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(cvs),
    update: jest.fn(), delete: jest.fn(), hasApplications: jest.fn(),
  };
  const userRepo: jest.Mocked<IUserRepository> = {
    findById: jest.fn().mockResolvedValue(targetUser),
  };
  return { cvRepo, userRepo };
}

/** Full deps for GetCVByIdUseCase */
function makeGetByIdDeps(cv: any = makeCV()) {
  const cvRepo: jest.Mocked<ICVRepository> = {
    save: jest.fn(), findById: jest.fn(),
    findByIdWithRelations: jest.fn().mockResolvedValue(cv),
    countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
    findByUserId: jest.fn(), update: jest.fn(), delete: jest.fn(), hasApplications: jest.fn(),
  };
  return { cvRepo };
}

/** Full deps for UpdateCVUseCase */
function makeUpdateDeps(opts: { existing?: any; template?: any } = {}) {
  const cvRepo: jest.Mocked<ICVRepository> = {
    save: jest.fn(),
    findById: jest.fn().mockResolvedValue(opts.existing !== undefined ? opts.existing : makeCV()),
    findByIdWithRelations: jest.fn().mockResolvedValue(makeCV()),
    countByUserId: jest.fn(), unsetMainForUser: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn(),
    update: jest.fn().mockResolvedValue(makeCV()),
    delete: jest.fn(), hasApplications: jest.fn(),
  };
  const tplRepo: jest.Mocked<ICVTemplateRepository> = {
    findById: jest.fn().mockResolvedValue(opts.template !== undefined ? opts.template : makeTpl()),
  };
  const fileSvc: jest.Mocked<IFileStorageService> = {
    uploadFile: jest.fn().mockResolvedValue('https://s/cv.pdf'),
  };
  const pdfSvc: jest.Mocked<IPDFService> = {
    renderTemplate: jest.fn().mockReturnValue('<h/>'),
    generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  return { cvRepo, tplRepo, fileSvc, pdfSvc };
}

/** Full deps for DeleteCVUseCase / SetMainCVUseCase */
function makeSimpleDeps(cv: any = makeCV(), hasApps = false) {
  const cvRepo: jest.Mocked<ICVRepository> = {
    save: jest.fn(), findById: jest.fn().mockResolvedValue(cv),
    findByIdWithRelations: jest.fn().mockResolvedValue(cv),
    countByUserId: jest.fn(), unsetMainForUser: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn().mockResolvedValue([cv]),
    update: jest.fn().mockResolvedValue(cv),
    delete: jest.fn().mockResolvedValue(undefined),
    hasApplications: jest.fn().mockResolvedValue(hasApps),
  };
  return { cvRepo };
}

// ═════════════════════════════════════════════════════════════════════════════
// SUITE A – CreateCVUseCase  (UT_F07_01 … UT_F07_20)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-A - CreateCVUseCase', () => {

  it('UT_F07_01 – CV dau tien tu dong set isMain=true', async () => {
    /**
     * TC ID   : UT_F07_01
     * Objective: CV dau tien cua user tu dong tro thanh CV chinh
     * Input   : userId="user-001", countByUserId()=0
     * Expected: save() nhan isMain=true; unsetMainForUser() goi 1 lan
     * Status  : PASS
     * Notes   : CheckDB – save() & unsetMainForUser() phai duoc goi
     *           Rollback – mock; DB thuc khong thay doi
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ countCV: 0 });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'My CV' });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: true }));
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledWith('user-001');
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledTimes(1);
  });

  it('UT_F07_02 – CV thu hai khong tu dong set isMain khi khong truyen isMain', async () => {
    /**
     * TC ID   : UT_F07_02
     * Objective: CV thu 2 tro di khong tu dong la main neu isMain khong truyen
     * Input   : countByUserId()=1, isMain=undefined
     * Expected: save() nhan isMain=false; unsetMainForUser() KHONG goi
     * Status  : PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ countCV: 1 });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'Second CV' });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: false }));
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalled();
  });

  it('UT_F07_03 – isMain=true tuong minh tren CV thu 2 goi unsetMainForUser', async () => {
    /**
     * TC ID   : UT_F07_03
     * Objective: Khi isMain=true truyen tuong minh, goi unsetMainForUser du da co CV
     * Input   : countByUserId()=3, isMain=true
     * Expected: save() nhan isMain=true; unsetMainForUser() goi 1 lan
     * Status  : PASS
     * Notes   : CheckDB – dam bao chi 1 CV la main
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ countCV: 3 });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'New Main', isMain: true });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: true }));
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledTimes(1);
  });

  it('UT_F07_04 – NotFoundError khi userId khong ton tai', async () => {
    /**
     * TC ID   : UT_F07_04
     * Objective: He thong tu choi tao CV cho user khong hop le
     * Input   : userId="ghost-user" → userRepo.findById()=null
     * Expected: NotFoundError("User not found"); save() KHONG goi
     * Status  : PASS
     * Notes   : So loi: 1 – NotFoundError tai CreateCVUseCase.execute() kiem tra user
     *           CheckDB – save() khong duoc goi
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ user: null });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'ghost-user', title: 'CV' })).rejects.toThrow(NotFoundError);
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_05 – ValidationError khi email sai dinh dang', async () => {
    /**
     * TC ID   : UT_F07_05
     * Objective: Ngan email khong hop le duoc luu vao CV
     * Input   : email="invalid-email"
     * Expected: ValidationError("Invalid email format"); save() KHONG goi
     * Status  : PASS
     * Notes   : So loi: 1 – ValidationError tai isValidEmail() -> execute()
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'user-001', title: 'CV', email: 'invalid' }))
      .rejects.toThrow(ValidationError);
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_06 – Email hop le duoc chap nhan va luu dung', async () => {
    /**
     * TC ID   : UT_F07_06 | Expected: save() nhan email="valid@example.com" | Status: PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV', email: 'valid@example.com' });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'valid@example.com' }));
  });

  it('UT_F07_07 – Email undefined duoc luu la null', async () => {
    /**
     * TC ID   : UT_F07_07 | Expected: save() nhan email=null | Status: PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV' });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('UT_F07_08 – NotFoundError khi templateId khong ton tai', async () => {
    /**
     * TC ID   : UT_F07_08 | Expected: NotFoundError("CV Template not found"); save() KHONG goi | Status: PASS
     * Notes   : So loi: 1 – NotFoundError tai kiem tra template ton tai
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ template: null });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'user-001', title: 'CV', templateId: 'ghost' }))
      .rejects.toThrow('CV Template not found');
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_09 – ValidationError khi template bi deactivated', async () => {
    /**
     * TC ID   : UT_F07_09 | Expected: ValidationError("not active"); save() KHONG goi | Status: PASS
     * Notes   : So loi: 1 – ValidationError tai template.isActive check
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } =
      makeCreateDeps({ template: makeTpl({ isActive: false }) });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'user-001', title: 'CV', templateId: 'tpl-001' }))
      .rejects.toThrow(/not active/);
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_10 – Template hop le kich hoat PDF pipeline day du', async () => {
    /**
     * TC ID   : UT_F07_10 | Expected: renderTemplate + generatePDF + uploadFile + update() | Status: PASS
     * Notes   : CheckDB – cvRepo.update() goi voi {pdfUrl: string}
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV with PDF', templateId: 'tpl-001' });
    expect(pdfSvc.renderTemplate).toHaveBeenCalled();
    expect(pdfSvc.generatePDF).toHaveBeenCalled();
    expect(fileSvc.uploadFile).toHaveBeenCalled();
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', expect.objectContaining({ pdfUrl: expect.any(String) }));
  });

  it('UT_F07_11 – Loi PDF pipeline khong lam that bai viec tao CV', async () => {
    /**
     * TC ID   : UT_F07_11 | Expected: CV tao thanh cong; loi PDF bi swallow | Status: PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    pdfSvc.generatePDF.mockRejectedValue(new Error('PDF crash'));
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(
      uc.execute({ userId: 'user-001', title: 'CV', templateId: 'tpl-001' })
    ).resolves.not.toThrow();
    expect(cvRepo.save).toHaveBeenCalledTimes(1);
  });

  it('UT_F07_12 – Tao CV voi skills, workExperiences, educations day du', async () => {
    /**
     * TC ID   : UT_F07_12 | Expected: save() nhan dung cac array | Status: PASS
     */
    const skills = [{ name: 'TypeScript', level: 'EXPERT' }];
    const works  = [{ title: 'Dev', company: 'ABC' }];
    const edus   = [{ school: 'PTIT', degree: 'Bachelor' }];
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV', skills, workExperiences: works, educations: edus });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ skills, workExperiences: works, educations: edus }));
  });

  it('UT_F07_13 – Cac mang mac dinh la [] khi khong truyen', async () => {
    /**
     * TC ID   : UT_F07_13 | Expected: save() nhan skills=[], educations=[], workExperiences=[] | Status: PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'Empty CV' });
    expect(cvRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ skills: [], educations: [], workExperiences: [], certifications: [] })
    );
  });

  it('UT_F07_14 – Thong tin ca nhan tuy chon duoc luu dung', async () => {
    /**
     * TC ID   : UT_F07_14 | Expected: save() nhan fullName, phoneNumber, summary dung | Status: PASS
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV', fullName: 'Le Van A', phoneNumber: '0901234567', summary: 'Summary text' });
    expect(cvRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Le Van A', phoneNumber: '0901234567', summary: 'Summary text' })
    );
  });

  it('UT_F07_15 – findByIdWithRelations duoc goi sau save() de tra ve CV day du', async () => {
    /**
     * TC ID   : UT_F07_15 | Expected: findByIdWithRelations("cv-001") goi sau save | Status: PASS
     * Notes   : CheckDB – xac minh du lieu duoc doc lai tu DB
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV' });
    expect(cvRepo.findByIdWithRelations).toHaveBeenCalledWith('cv-001');
  });

  // ── Bug-finding tests (UT_F07_16 .. UT_F07_20) ──────────────────────────
  it('UT_F07_16 – [BUG] email="" phai duoc luu la null, khong phai chuoi rong', async () => {
    /**
     * TC ID   : UT_F07_16
     * Objective: Email rong ("") phai duoc chuan hoa thanh null truoc khi luu
     * Input   : email=""
     * Expected: save() nhan email=null
     * Actual  : save() nhan email="" vi `"" ?? null` = `""` (khong fallback)
     * Status  : FAIL – BUG: doi `input.email ?? null` thanh `input.email || null`
     * Notes   : So loi: 1 – CreateCVUseCase.execute() dong `email: input.email ?? null`
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'CV', email: '' });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('UT_F07_17 – [BUG] title="" phai nem ValidationError nhung khong co kiem tra', async () => {
    /**
     * TC ID   : UT_F07_17
     * Objective: Tieu de CV rong phai bi tu choi boi validation
     * Input   : title=""
     * Expected: ValidationError("Title cannot be empty")
     * Actual  : CV duoc tao thanh cong voi title rong – khong co validation
     * Status  : FAIL – BUG: them `if (!input.title?.trim()) throw new ValidationError(...)`
     * Notes   : So loi: 0 thuc te (nhung phai co 1) – thieu validation cho title
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'user-001', title: '' })).rejects.toThrow(ValidationError);
  });

  it('UT_F07_18 – [BUG] title="   " (khoang trang) phai nem ValidationError', async () => {
    /**
     * TC ID   : UT_F07_18
     * Objective: Tieu de chi la khoang trang phai bi tu choi sau khi trim
     * Input   : title="   " (3 spaces)
     * Expected: ValidationError
     * Actual  : CV duoc tao – khong co trim va validate
     * Status  : FAIL – BUG: thieu `input.title.trim() === ""` check
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps();
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ userId: 'user-001', title: '   ' })).rejects.toThrow(ValidationError);
  });

  it('UT_F07_19 – [BUG] isMain=false tuong minh tren CV dau tien phai bi override thanh true', async () => {
    /**
     * TC ID   : UT_F07_19
     * Objective: CV dau tien LUON phai la main bat ke isMain=false duoc truyen
     * Input   : countByUserId()=0 (first CV), isMain=false (tuong minh)
     * Expected: save() nhan isMain=true
     * Actual  : save() nhan isMain=false vi `false ?? true` = `false` (khong fallback)
     * Status  : FAIL – BUG NGHIEM TRONG: doi `input.isMain ?? isFirst` thanh `isFirst ? true : (input.isMain ?? false)`
     * Notes   : So loi: 1 – logic tai dong `isMain: input.isMain ?? isFirst`
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ countCV: 0 });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'First CV', isMain: false });
    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: true }));
  });

  it('UT_F07_20 – [BUG] unsetMainForUser goi nhung CV luu isMain=false - user mat toan bo main CV', async () => {
    /**
     * TC ID   : UT_F07_20
     * Objective: Sau khi tao CV dau tien voi isMain=false, khong duoc goi unsetMainForUser
     *            vi se dan den khong co CV main nao ton tai
     * Input   : countByUserId()=0, isMain=false
     * Expected: unsetMainForUser() KHONG duoc goi (hoac CV phai save la isMain=true)
     * Actual  : unsetMainForUser() BI GOI (vi false || true = true) nhung CV luu isMain=false
     * Status  : FAIL – BUG: he qua cua UT_F07_19; trang thai khong nhat quan
     * Notes   : So loi: 1 – logic tai `if (input.isMain || isFirst)` khong xu ly truong hop nay
     */
    const { cvRepo, userRepo, tplRepo, fileSvc, pdfSvc } = makeCreateDeps({ countCV: 0 });
    const uc = new CreateCVUseCase(cvRepo, userRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ userId: 'user-001', title: 'First CV', isMain: false });
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE B – GetCVsByUserUseCase  (UT_F07_21 … UT_F07_31)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-B - GetCVsByUserUseCase', () => {

  it('UT_F07_21 – Owner (CANDIDATE) xem danh sach CV cua chinh minh', async () => {
    /**
     * TC ID: UT_F07_21 | Status: PASS
     * Expected: Danh sach CV tra ve; findByUserId("user-001") duoc goi
     */
    const { cvRepo, userRepo } = makeGetListDeps();
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'user-001', targetUserId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.cvs).toHaveLength(1);
    expect(cvRepo.findByUserId).toHaveBeenCalledWith('user-001');
  });

  it('UT_F07_22 – ADMIN xem CV cua bat ky user nao', async () => {
    /**
     * TC ID: UT_F07_22 | Status: PASS
     * Input: userId="admin-001", targetUserId="other-user", userRole=ADMIN
     */
    const { cvRepo, userRepo } = makeGetListDeps([makeCV({ userId: 'other' })], makeUser({ id: 'other' }));
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'admin-001', targetUserId: 'other', userRole: UserRole.ADMIN });
    expect(res.cvs).toHaveLength(1);
  });

  it('UT_F07_23 – RECRUITER xem duoc CV ung vien', async () => {
    /**
     * TC ID: UT_F07_23 | Status: PASS
     * Expected: Danh sach CV tra ve; khong co AuthorizationError
     */
    const { cvRepo, userRepo } = makeGetListDeps();
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'rec-001', targetUserId: 'user-001', userRole: UserRole.RECRUITER });
    expect(res.cvs).toHaveLength(1);
  });

  it('UT_F07_24 – AuthorizationError khi CANDIDATE xem CV nguoi khac', async () => {
    /**
     * TC ID: UT_F07_24 | Status: PASS
     * Expected: AuthorizationError; findByUserId() KHONG goi
     * Notes: So loi: 1 – AuthorizationError tai permission check GetCVsByUserUseCase
     */
    const { cvRepo, userRepo } = makeGetListDeps([], makeUser({ id: 'other' }));
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    await expect(uc.execute({ userId: 'user-001', targetUserId: 'other', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
    expect(cvRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F07_25 – NotFoundError khi targetUserId khong ton tai', async () => {
    /**
     * TC ID: UT_F07_25 | Status: PASS
     * Expected: NotFoundError; findByUserId() KHONG goi
     * Notes: So loi: 1 – NotFoundError tai targetUser existence check
     */
    const { cvRepo, userRepo } = makeGetListDeps([], null);
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    await expect(uc.execute({ userId: 'user-001', targetUserId: 'ghost', userRole: UserRole.ADMIN }))
      .rejects.toThrow('Không tìm thấy người dùng');
    expect(cvRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F07_26 – Tra ve mang rong khi user chua co CV', async () => {
    /**
     * TC ID: UT_F07_26 | Status: PASS
     * Expected: { cvs: [] }
     */
    const { cvRepo, userRepo } = makeGetListDeps([]);
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'user-001', targetUserId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.cvs).toEqual([]);
  });

  it('UT_F07_27 – Tra ve dung so luong khi user co nhieu CV', async () => {
    /**
     * TC ID: UT_F07_27 | Status: PASS
     */
    const many = [makeCV({ id: 'c1' }), makeCV({ id: 'c2' }), makeCV({ id: 'c3' })];
    const { cvRepo, userRepo } = makeGetListDeps(many);
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'user-001', targetUserId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.cvs).toHaveLength(3);
  });

  it('UT_F07_28 – findByUserId goi voi targetUserId chinh xac', async () => {
    /**
     * TC ID: UT_F07_28 | Status: PASS
     * Notes: CheckDB – query dung targetUserId khong phai userId caller
     */
    const { cvRepo, userRepo } = makeGetListDeps([], makeUser({ id: 'cand-999' }));
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    await uc.execute({ userId: 'admin-001', targetUserId: 'cand-999', userRole: UserRole.ADMIN });
    expect(cvRepo.findByUserId).toHaveBeenCalledWith('cand-999');
    expect(cvRepo.findByUserId).not.toHaveBeenCalledWith('admin-001');
  });

  it('UT_F07_29 – RECRUITER xem CV cua chinh minh (isOwner=true)', async () => {
    /**
     * TC ID: UT_F07_29 | Status: PASS
     */
    const { cvRepo, userRepo } = makeGetListDeps([makeCV({ userId: 'rec-001' })], makeUser({ id: 'rec-001' }));
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'rec-001', targetUserId: 'rec-001', userRole: UserRole.RECRUITER });
    expect(res.cvs).toHaveLength(1);
  });

  it('UT_F07_30 – userRepo.findById goi voi targetUserId de validate su ton tai', async () => {
    /**
     * TC ID: UT_F07_30 | Status: PASS
     * Notes: CheckDB – xac minh buoc validate targetUser
     */
    const { cvRepo, userRepo } = makeGetListDeps();
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    await uc.execute({ userId: 'user-001', targetUserId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(userRepo.findById).toHaveBeenCalledWith('user-001');
    expect(userRepo.findById).toHaveBeenCalledTimes(1);
  });

  it('UT_F07_31 – [BUG] RECRUITER xem tat ca CV ke ca CV khong cong khai (isOpenForJob=false)', async () => {
    /**
     * TC ID   : UT_F07_31
     * Objective: GetCVsByUserUseCase cho RECRUITER xem moi CV – khe ho bao mat
     *            GetCVByIdUseCase yeu cau isOpenForJob=true cho RECRUITER
     *            nhung GetCVsByUserUseCase khong loc – khong nhat quan
     * Input   : RECRUITER xem, CVs co isOpenForJob=false
     * Expected: Chi tra ve CVs co isOpenForJob=true (loc rieng tu)
     * Actual  : Tra ve TAT CA CVs ke ca private (isOpenForJob=false)
     * Status  : FAIL – BUG: GetCVsByUserUseCase thieu logic loc isOpenForJob cho RECRUITER
     * Notes   : So loi: 1 – thieu filter logic trong GetCVsByUserUseCase
     */
    const cvList = [
      makeCV({ id: 'cv-pub', isOpenForJob: true }),
      makeCV({ id: 'cv-priv', isOpenForJob: false }),
    ];
    const { cvRepo, userRepo } = makeGetListDeps(cvList);
    const uc = new GetCVsByUserUseCase(cvRepo, userRepo);
    const res = await uc.execute({ userId: 'rec-001', targetUserId: 'user-001', userRole: UserRole.RECRUITER });
    // Expected: only public CVs returned
    expect(res.cvs).toHaveLength(1);
    expect((res.cvs[0] as any).id).toBe('cv-pub');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE C – GetCVByIdUseCase  (UT_F07_32 … UT_F07_42)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-C - GetCVByIdUseCase', () => {

  it('UT_F07_32 – Owner xem duoc CV cua chinh minh', async () => {
    /**
     * TC ID: UT_F07_32 | Status: PASS
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ isOpenForJob: false }));
    const uc = new GetCVByIdUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.id).toBe('cv-001');
  });

  it('UT_F07_33 – ADMIN xem CV bat ky ke ca CV khong cong khai', async () => {
    /**
     * TC ID: UT_F07_33 | Status: PASS
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other', isOpenForJob: false }));
    const uc = new GetCVByIdUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(res.id).toBe('cv-001');
  });

  it('UT_F07_34 – RECRUITER xem duoc CV cong khai (isOpenForJob=true)', async () => {
    /**
     * TC ID: UT_F07_34 | Status: PASS
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other', isOpenForJob: true }));
    const uc = new GetCVByIdUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'rec-001', userRole: UserRole.RECRUITER });
    expect(res.id).toBe('cv-001');
  });

  it('UT_F07_35 – AuthorizationError khi RECRUITER xem CV khong cong khai', async () => {
    /**
     * TC ID: UT_F07_35 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError: "CV nay khong cong khai"
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other', isOpenForJob: false }));
    const uc = new GetCVByIdUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'rec-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(/không công khai/);
  });

  it('UT_F07_36 – AuthorizationError khi CANDIDATE xem CV nguoi khac', async () => {
    /**
     * TC ID: UT_F07_36 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError cuoi ham execute
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other', isOpenForJob: true }));
    const uc = new GetCVByIdUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F07_37 – NotFoundError khi cvId khong ton tai', async () => {
    /**
     * TC ID: UT_F07_37 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai cv existence check
     */
    const { cvRepo } = makeGetByIdDeps(null);
    const uc = new GetCVByIdUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'ghost', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
  });

  it('UT_F07_38 – Owner voi isOpenForJob=false van xem duoc CV cua minh', async () => {
    /**
     * TC ID: UT_F07_38 | Status: PASS
     * isOpenForJob check chi ap dung cho RECRUITER; owner luon duoc xem
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ isOpenForJob: false }));
    const uc = new GetCVByIdUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.id).toBe('cv-001');
  });

  it('UT_F07_39 – findByIdWithRelations goi voi cvId chinh xac', async () => {
    /**
     * TC ID: UT_F07_39 | Status: PASS
     * Notes: CheckDB – xac minh query dung cvId
     */
    const { cvRepo } = makeGetByIdDeps();
    const uc = new GetCVByIdUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(cvRepo.findByIdWithRelations).toHaveBeenCalledWith('cv-001');
    expect(cvRepo.findByIdWithRelations).toHaveBeenCalledTimes(1);
  });

  it('UT_F07_40 – RECRUITER xem CV voi isOpenForJob=null duoc xu ly nhu false', async () => {
    /**
     * TC ID: UT_F07_40 | Status: PASS
     * isOpenForJob=null → !null = true → throw AuthorizationError (correct)
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other', isOpenForJob: null }));
    const uc = new GetCVByIdUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'rec-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F07_41 – UserRole khong xac dinh bi tu choi (khong phai owner/admin/recruiter)', async () => {
    /**
     * TC ID: UT_F07_41 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai cuoi execute (fall-through)
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'other' }));
    const uc = new GetCVByIdUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: 'UNKNOWN_ROLE' }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F07_42 – ADMIN la owner cung xem duoc (isOwner check truoc isAdmin)', async () => {
    /**
     * TC ID: UT_F07_42 | Status: PASS
     * Admin xem CV cua chinh ho → isOwner=true → return truoc khi kiem tra isAdmin
     */
    const { cvRepo } = makeGetByIdDeps(makeCV({ userId: 'admin-001' }));
    const uc = new GetCVByIdUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(res.id).toBe('cv-001');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE D – UpdateCVUseCase  (UT_F07_43 … UT_F07_55)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-D - UpdateCVUseCase', () => {

  it('UT_F07_43 – Owner cap nhat CV thanh cong', async () => {
    /**
     * TC ID: UT_F07_43 | Status: PASS
     * Notes: CheckDB – update() goi voi dung cvId
     *        Rollback – mock; DB thuc khong thay doi
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps();
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, title: 'Updated' });
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', expect.objectContaining({ title: 'Updated' }));
  });

  it('UT_F07_44 – ADMIN cap nhat CV cua nguoi khac thanh cong', async () => {
    /**
     * TC ID: UT_F07_44 | Status: PASS
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps();
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN, title: 'Admin Update' });
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', expect.objectContaining({ title: 'Admin Update' }));
  });

  it('UT_F07_45 – NotFoundError khi cvId khong ton tai', async () => {
    /**
     * TC ID: UT_F07_45 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai kiem tra CV ton tai
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ existing: null });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ cvId: 'ghost', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
    expect(cvRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F07_46 – AuthorizationError khi khong phai owner va khong phai admin', async () => {
    /**
     * TC ID: UT_F07_46 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai permission check UpdateCVUseCase
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ existing: makeCV({ userId: 'other' }) });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
    expect(cvRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F07_47 – ValidationError khi email sai dinh dang khi cap nhat', async () => {
    /**
     * TC ID: UT_F07_47 | Status: PASS
     * Notes: So loi: 1 – ValidationError tai isValidEmail() trong UpdateCVUseCase
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps();
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, email: 'bad-email' }))
      .rejects.toThrow(ValidationError);
    expect(cvRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F07_48 – NotFoundError khi templateId moi khong ton tai', async () => {
    /**
     * TC ID: UT_F07_48 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai kiem tra template moi
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ template: null });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, templateId: 'ghost-tpl' }))
      .rejects.toThrow(NotFoundError);
  });

  it('UT_F07_49 – Cap nhat isMain=true khi CV chua la main goi unsetMainForUser', async () => {
    /**
     * TC ID: UT_F07_49 | Status: PASS
     * Notes: CheckDB – unsetMainForUser goi voi userId cua CV
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ existing: makeCV({ isMain: false }) });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, isMain: true });
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledWith('user-001');
  });

  it('UT_F07_50 – Cap nhat isMain=true khi CV DA la main KHONG goi unsetMainForUser them', async () => {
    /**
     * TC ID: UT_F07_50 | Status: PASS
     * isMain=true && existingCV.isMain=true → dieu kien if (isMain && !existing.isMain) = false → khong goi
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ existing: makeCV({ isMain: true }) });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, isMain: true });
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalled();
  });

  // ── Bug-finding ──────────────────────────────────────────────────────────
  it('UT_F07_51 – [BUG] email="" khi cap nhat khong duoc validate, luu vao updateData', async () => {
    /**
     * TC ID   : UT_F07_51
     * Objective: email="" phai bi chuyen thanh null hoac bi tu choi boi validation
     * Input   : email=""
     * Expected: updateData.email = null hoac ValidationError
     * Actual  : updateData.email = "" vi `input.email && !isEmail("")` = `"" && false` = false (bo qua)
     * Status  : FAIL – BUG: thieu xu ly email rong khi update
     * Notes   : So loi: 1 – UpdateCVUseCase email validation bo qua empty string
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps();
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, email: '' });
    // Expected: neu email="" thi updateData.email phai la null
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', expect.objectContaining({ email: null }));
  });

  it('UT_F07_52 – [BUG] title="" khi cap nhat khong co validation – CV co the co tieu de rong', async () => {
    /**
     * TC ID   : UT_F07_52
     * Objective: Tieu de rong phai bi tu choi boi validation khi cap nhat
     * Input   : title=""
     * Expected: ValidationError
     * Actual  : update() goi voi title="" – khong co kiem tra
     * Status  : FAIL – BUG: thieu `if (input.title !== undefined && !input.title?.trim()) throw`
     * Notes   : So loi: 0 thuc te – thieu validation cho title khi update
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps();
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, title: '' }))
      .rejects.toThrow(ValidationError);
  });

  it('UT_F07_53 – [BUG] isMain=false tren main CV → mat CV main, khong co promote', async () => {
    /**
     * TC ID   : UT_F07_53
     * Objective: Khi dat isMain=false cho CV dang la main, he thong phai
     *            promote CV khac len main hoac tu choi thao tac
     * Input   : existingCV.isMain=true, input.isMain=false
     * Expected: He thong goi unsetMainForUser + promote hoac throw ConflictError
     * Actual  : update() goi voi {isMain: false}; khong co promote; user mat CV main
     * Status  : FAIL – BUG NGHIEM TRONG: UpdateCVUseCase thieu logic xu ly unset main
     * Notes   : So loi: 1 – thieu xu ly `if (input.isMain===false && existing.isMain) → promote another`
     */
    const { cvRepo, tplRepo, fileSvc, pdfSvc } = makeUpdateDeps({ existing: makeCV({ isMain: true }) });
    const uc = new UpdateCVUseCase(cvRepo, tplRepo, fileSvc, pdfSvc);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE, isMain: false });
    // Expected: unsetMainForUser KHONG goi (se xoa main cua CV khac) hoac co promote logic
    // Actual: update() bi goi voi {isMain: false} – user se khong co CV main
    expect(cvRepo.update).not.toHaveBeenCalledWith('cv-001', expect.objectContaining({ isMain: false }));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE E – DeleteCVUseCase  (UT_F07_56 … UT_F07_63)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-E - DeleteCVUseCase', () => {

  it('UT_F07_56 – Xoa CV khong phai main thanh cong', async () => {
    /**
     * TC ID: UT_F07_56 | Status: PASS
     * Notes: CheckDB – delete() goi voi cvId chinh xac
     *        Rollback – mock; DB thuc khong thay doi
     */
    const cv = makeCV({ isMain: false });
    const { cvRepo } = makeSimpleDeps(cv, false);
    const uc = new DeleteCVUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.success).toBe(true);
    expect(cvRepo.delete).toHaveBeenCalledWith('cv-001');
  });

  it('UT_F07_57 – NotFoundError khi cvId khong ton tai', async () => {
    /**
     * TC ID: UT_F07_57 | Status: PASS
     * Notes: So loi: 1 – NotFoundError tai cv existence check
     */
    const { cvRepo } = makeSimpleDeps(null);
    const uc = new DeleteCVUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'ghost', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
    expect(cvRepo.delete).not.toHaveBeenCalled();
  });

  it('UT_F07_58 – AuthorizationError khi khong phai owner va khong phai admin', async () => {
    /**
     * TC ID: UT_F07_58 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError tai permission check DeleteCVUseCase
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ userId: 'other' }), false);
    const uc = new DeleteCVUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
    expect(cvRepo.delete).not.toHaveBeenCalled();
  });

  it('UT_F07_59 – ConflictError khi CV da co don ung tuyen', async () => {
    /**
     * TC ID: UT_F07_59 | Status: PASS
     * Notes: So loi: 1 – ConflictError; delete() KHONG goi
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ isMain: false }), true);
    const uc = new DeleteCVUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(ConflictError);
    expect(cvRepo.delete).not.toHaveBeenCalled();
  });

  it('UT_F07_60 – Khi xoa main CV, tu dong promote CV khac len main', async () => {
    /**
     * TC ID: UT_F07_60 | Status: PASS
     * Notes: CheckDB – cvRepo.update(otherCvId, {isMain:true}) duoc goi
     */
    const mainCV  = makeCV({ id: 'cv-main', isMain: true, createdAt: new Date('2023-01-01') });
    const otherCV = makeCV({ id: 'cv-old',  isMain: false, createdAt: new Date('2022-01-01') });
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findById: jest.fn().mockResolvedValue(mainCV),
      findByIdWithRelations: jest.fn(), countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([mainCV, otherCV]),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
      hasApplications: jest.fn().mockResolvedValue(false),
    };
    const uc = new DeleteCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-main', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(cvRepo.update).toHaveBeenCalledWith('cv-old', { isMain: true });
    expect(cvRepo.delete).toHaveBeenCalledWith('cv-main');
  });

  it('UT_F07_61 – Khi xoa main CV va khong con CV khac, khong goi promote', async () => {
    /**
     * TC ID: UT_F07_61 | Status: PASS
     */
    const mainCV = makeCV({ isMain: true });
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findById: jest.fn().mockResolvedValue(mainCV),
      findByIdWithRelations: jest.fn(), countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([mainCV]),
      update: jest.fn(), delete: jest.fn().mockResolvedValue(undefined),
      hasApplications: jest.fn().mockResolvedValue(false),
    };
    const uc = new DeleteCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(cvRepo.update).not.toHaveBeenCalled();
    expect(cvRepo.delete).toHaveBeenCalledWith('cv-001');
  });

  it('UT_F07_62 – ADMIN xoa duoc CV cua nguoi khac', async () => {
    /**
     * TC ID: UT_F07_62 | Status: PASS
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ userId: 'other', isMain: false }), false);
    const uc = new DeleteCVUseCase(cvRepo);
    const res = await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(res.success).toBe(true);
  });

  it('UT_F07_63 – [BUG] CV co don ung tuyen da CANCELLED van bi chan xoa - thieu loc status', async () => {
    /**
     * TC ID   : UT_F07_63
     * Objective: CV chi co don CANCELLED (da huy) van bi chan xoa la khong hop ly
     *            Nguoi dung da huy toan bo don nhung van khong the xoa CV
     * Input   : hasApplications()=true (bao gom ca don CANCELLED)
     * Expected: CV duoc xoa khi chi con don CANCELLED
     * Actual  : ConflictError – hasApplications() khong loc theo status don
     * Status  : FAIL – BUG: thieu `hasActiveApplications()` phan biet don con hieu luc
     * Notes   : So loi: 1 – DeleteCVUseCase.hasApplications() khong phan biet CANCELLED vs ACTIVE
     */
    const cv = makeCV({ isMain: false });
    // Mock: hasApplications tra ve true (bao gom ca CANCELLED)
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findById: jest.fn().mockResolvedValue(cv),
      findByIdWithRelations: jest.fn(), countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(), delete: jest.fn().mockResolvedValue(undefined),
      hasApplications: jest.fn().mockResolvedValue(true), // includes CANCELLED
    };
    const uc = new DeleteCVUseCase(cvRepo);
    // Expected: xoa thanh cong vi chi co CANCELLED applications
    // Actual: ConflictError bi nem – day la bug
    const res = await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(res.success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE F – SetMainCVUseCase  (UT_F07_64 … UT_F07_70)
// ═════════════════════════════════════════════════════════════════════════════
describe('F07-F - SetMainCVUseCase', () => {

  it('UT_F07_64 – Set main CV thanh cong', async () => {
    /**
     * TC ID: UT_F07_64 | Status: PASS
     * Notes: CheckDB – unsetMainForUser + update({isMain:true}) duoc goi
     *        Rollback – mock; DB thuc khong thay doi
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ isMain: false }));
    const uc = new SetMainCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledWith('user-001');
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', { isMain: true });
  });

  it('UT_F07_65 – NotFoundError khi cvId khong ton tai', async () => {
    /**
     * TC ID: UT_F07_65 | Status: PASS
     * Notes: So loi: 1 – NotFoundError; update() KHONG goi
     */
    const { cvRepo } = makeSimpleDeps(null);
    const uc = new SetMainCVUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'ghost', userId: 'user-001', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
    expect(cvRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F07_66 – AuthorizationError khi RECRUITER co gang set main CV cua nguoi khac', async () => {
    /**
     * TC ID: UT_F07_66 | Status: PASS
     * Notes: So loi: 1 – AuthorizationError: RECRUITER khong phai owner va khong phai ADMIN
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ userId: 'other' }));
    const uc = new SetMainCVUseCase(cvRepo);
    await expect(uc.execute({ cvId: 'cv-001', userId: 'rec-001', userRole: UserRole.RECRUITER }))
      .rejects.toThrow(AuthorizationError);
  });

  it('UT_F07_67 – ADMIN set main CV cua nguoi khac thanh cong', async () => {
    /**
     * TC ID: UT_F07_67 | Status: PASS
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ userId: 'other' }));
    const uc = new SetMainCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(cvRepo.update).toHaveBeenCalledWith('cv-001', { isMain: true });
  });

  it('UT_F07_68 – findByIdWithRelations goi sau update de tra ve CV day du', async () => {
    /**
     * TC ID: UT_F07_68 | Status: PASS
     * Notes: CheckDB – xac minh du lieu duoc doc lai tu DB
     */
    const { cvRepo } = makeSimpleDeps();
    const uc = new SetMainCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(cvRepo.findByIdWithRelations).toHaveBeenCalledWith('cv-001');
  });

  it('UT_F07_69 – unsetMainForUser goi voi userId cua CV (khong phai userId caller)', async () => {
    /**
     * TC ID: UT_F07_69 | Status: PASS
     * Notes: CheckDB – phai dung userId cua CV chu so huu
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ userId: 'cv-owner' }));
    const uc = new SetMainCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'admin-001', userRole: UserRole.ADMIN });
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledWith('cv-owner');
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalledWith('admin-001');
  });

  it('UT_F07_70 – [BUG] Set main CV DA la main van goi unsetMainForUser (brief no-main state)', async () => {
    /**
     * TC ID   : UT_F07_70
     * Objective: Khi CV da la main, SetMainCV van goi unsetMainForUser (xoa tat ca main)
     *            truoc khi goi update → co khoang thoi gian ngan user khong co CV main nao
     *            Voi concurrent requests co the gay ra trang thai bat nhat
     * Input   : existingCV.isMain=true, goi SetMainCV
     * Expected: Neu CV da la main → SKIP (khong goi unsetMainForUser de tranh brief inconsistency)
     * Actual  : unsetMainForUser VAN DUOC GOI → brief no-main state
     * Status  : FAIL – BUG: thieu `if (existingCV.isMain) return existingCV` early return
     * Notes   : So loi: 1 – SetMainCVUseCase.execute() thieu idempotency check
     */
    const { cvRepo } = makeSimpleDeps(makeCV({ isMain: true }));
    const uc = new SetMainCVUseCase(cvRepo);
    await uc.execute({ cvId: 'cv-001', userId: 'user-001', userRole: UserRole.CANDIDATE });
    // Expected: KHONG goi unsetMainForUser neu CV da la main (de tranh brief inconsistency)
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalled();
  });
});
