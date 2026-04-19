/**
 * @file SQA03_Nhom7_UT_CVManagement.test.ts
 * @module F07_QuanLyCV
 * @description Unit tests for CreateCVUseCase & GetCVsByUserUseCase
 *              F07: Quản lý hồ sơ CV (Ứng viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Tạo CV đầu tiên (tự động set isMain=true)
 *  - Tạo CV với templateId hợp lệ
 *  - Thất bại khi user không tồn tại
 *  - Thất bại khi email không đúng định dạng
 *  - Thất bại khi template không tồn tại
 *  - Thất bại khi template không active
 *  - Xem danh sách CV của chính mình (owner)
 *  - Admin xem CV của người dùng bất kỳ
 *  - Thất bại khi không có quyền xem CV người khác
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class ValidationError extends Error {
  statusCode = 400;
  constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
}
class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface ICVRepository {
  save(data: any): Promise<any>;
  findByIdWithRelations(id: string): Promise<any | null>;
  countByUserId(userId: string): Promise<number>;
  unsetMainForUser(userId: string): Promise<void>;
  findByUserId(userId: string): Promise<any[]>;
  update(id: string, data: any): Promise<any>;
}
interface IUserRepository {
  findById(id: string): Promise<any | null>;
}
interface ICVTemplateRepository {
  findById(id: string): Promise<any | null>;
}
interface IFileStorageService {
  uploadFile(file: any, folder: string, filename?: string): Promise<string>;
}
interface IPDFService {
  renderTemplate(html: string, data: any): string;
  generatePDF(html: string): Promise<Buffer>;
}

class CreateCVUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private userRepo: IUserRepository,
    private templateRepo: ICVTemplateRepository,
    private fileStorageSvc: IFileStorageService,
    private pdfSvc: IPDFService,
  ) {}

  async execute(input: {
    userId: string;
    title: string;
    email?: string;
    isMain?: boolean;
    templateId?: string;
    skills?: any[];
    educations?: any[];
    workExperiences?: any[];
  }) {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');

    if (input.email && !this.isValidEmail(input.email))
      throw new ValidationError('Invalid email format');

    if (input.templateId) {
      const template = await this.templateRepo.findById(input.templateId);
      if (!template) throw new NotFoundError('CV Template not found');
      if (!template.isActive) throw new ValidationError('CV Template is not active');
    }

    const existingCount = await this.cvRepo.countByUserId(input.userId);
    const isFirst = existingCount === 0;

    if (input.isMain || isFirst) {
      await this.cvRepo.unsetMainForUser(input.userId);
    }

    const cv = await this.cvRepo.save({
      userId: input.userId,
      title: input.title,
      templateId: input.templateId ?? null,
      email: input.email ?? null,
      isMain: input.isMain ?? isFirst,
      skills: input.skills ?? [],
      educations: input.educations ?? [],
      workExperiences: input.workExperiences ?? [],
    });

    return await this.cvRepo.findByIdWithRelations(cv.id);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

class GetCVsByUserUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private userRepo: IUserRepository,
  ) {}

  async execute(input: { userId: string; targetUserId: string; userRole: string }) {
    const targetUser = await this.userRepo.findById(input.targetUserId);
    if (!targetUser) throw new NotFoundError('Không tìm thấy người dùng');

    const isOwner = input.userId === input.targetUserId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;

    if (!isOwner && !isAdmin && !isRecruiter)
      throw new AuthorizationError('Bạn không có quyền xem các CV này');

    const cvs = await this.cvRepo.findByUserId(input.targetUserId);
    return { cvs };
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildCV = (overrides: any = {}) => ({
  id: 'cv-001',
  userId: 'user-001',
  title: 'My CV',
  isMain: true,
  templateId: null,
  skills: [],
  ...overrides,
});

const buildUser = (overrides: any = {}) => ({
  id: 'user-001',
  email: 'user@example.com',
  role: UserRole.CANDIDATE,
  ...overrides,
});

// =====================================================================
// TEST SUITE: CreateCVUseCase
// =====================================================================
describe('F07 - Tạo CV | CreateCVUseCase', () => {

  const makeCreateCVDeps = (userOverrides: any = {}) => {
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn().mockResolvedValue(buildCV()),
      findByIdWithRelations: jest.fn().mockResolvedValue(buildCV()),
      countByUserId: jest.fn().mockResolvedValue(0),
      unsetMainForUser: jest.fn().mockResolvedValue(undefined),
      findByUserId: jest.fn(),
      update: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(buildUser(userOverrides)),
    };
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'template-001', isActive: true }),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      uploadFile: jest.fn().mockResolvedValue('https://storage/cv.pdf'),
    };
    const pdfSvc: jest.Mocked<IPDFService> = {
      renderTemplate: jest.fn().mockReturnValue('<html>...</html>'),
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    return { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc };
  };

  it('UT_F07_01 – Tạo CV đầu tiên thành công, isMain tự động là true', async () => {
    /**
     * Test Case ID : UT_F07_01
     * Test Objective: CV đầu tiên của user tự động trở thành CV chính
     * Input         : userId="user-001", title="My CV", không truyền isMain
     * Expected Output: cvRepo.save() với isMain=true; unsetMainForUser() được gọi
     * Notes         : CheckDB – save() và unsetMainForUser() phải được gọi 1 lần
     *                 Rollback – mock; không thay đổi DB thực
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    cvRepo.countByUserId.mockResolvedValue(0); // không có CV trước đó
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await useCase.execute({ userId: 'user-001', title: 'My CV' });

    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: true }));
    expect(cvRepo.unsetMainForUser).toHaveBeenCalledWith('user-001');
  });

  it('UT_F07_02 – Tạo CV thứ hai không tự động set isMain', async () => {
    /**
     * Test Case ID : UT_F07_02
     * Test Objective: CV thứ hai không tự động trở thành main khi không truyền isMain=true
     * Input         : countByUserId() trả về 1 (đã có 1 CV)
     * Expected Output: isMain=false (isFirst=false, input.isMain=undefined)
     * Notes         : unsetMainForUser() KHÔNG được gọi
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    cvRepo.countByUserId.mockResolvedValue(1);
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await useCase.execute({ userId: 'user-001', title: 'Second CV' });

    expect(cvRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isMain: false }));
    expect(cvRepo.unsetMainForUser).not.toHaveBeenCalled();
  });

  it('UT_F07_03 – Thất bại khi user không tồn tại', async () => {
    /**
     * Test Case ID : UT_F07_03
     * Test Objective: NotFoundError khi userId không có trong DB
     * Input         : userId="ghost-user"
     * Expected Output: NotFoundError "User not found"
     * Notes         : CheckDB – save() KHÔNG được gọi
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    userRepo.findById.mockResolvedValue(null);
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await expect(useCase.execute({ userId: 'ghost-user', title: 'CV' }))
      .rejects.toThrow(NotFoundError);
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_04 – Thất bại khi email không đúng định dạng', async () => {
    /**
     * Test Case ID : UT_F07_04
     * Test Objective: ValidationError khi email sai format
     * Input         : email="invalid-email"
     * Expected Output: ValidationError "Invalid email format"
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await expect(useCase.execute({ userId: 'user-001', title: 'CV', email: 'invalid-email' }))
      .rejects.toThrow(ValidationError);
    expect(cvRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F07_05 – Thất bại khi templateId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F07_05
     * Test Objective: NotFoundError khi template không có trong DB
     * Input         : templateId="ghost-template"
     * Expected Output: NotFoundError "CV Template not found"
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    templateRepo.findById.mockResolvedValue(null);
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await expect(useCase.execute({ userId: 'user-001', title: 'CV', templateId: 'ghost-template' }))
      .rejects.toThrow(/CV Template not found/);
  });

  it('UT_F07_06 – Thất bại khi template bị deactivated', async () => {
    /**
     * Test Case ID : UT_F07_06
     * Test Objective: ValidationError khi template tồn tại nhưng không active
     * Input         : template.isActive=false
     * Expected Output: ValidationError "CV Template is not active"
     */
    const { cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc } = makeCreateCVDeps();
    templateRepo.findById.mockResolvedValue({ id: 'template-001', isActive: false });
    const useCase = new CreateCVUseCase(cvRepo, userRepo, templateRepo, fileStorageSvc, pdfSvc);

    await expect(useCase.execute({ userId: 'user-001', title: 'CV', templateId: 'template-001' }))
      .rejects.toThrow(/not active/);
  });
});

// =====================================================================
// TEST SUITE: GetCVsByUserUseCase
// =====================================================================
describe('F07 - Xem danh sách CV | GetCVsByUserUseCase', () => {

  it('UT_F07_07 – Owner xem danh sách CV của chính mình', async () => {
    /**
     * Test Case ID : UT_F07_07
     * Test Objective: Ứng viên có thể xem CV của chính mình
     * Input         : userId === targetUserId
     * Expected Output: Danh sách CV trả về
     */
    const cvs = [buildCV()];
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findByIdWithRelations: jest.fn(),
      countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue(cvs), update: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(buildUser()),
    };
    const useCase = new GetCVsByUserUseCase(cvRepo, userRepo);

    const result = await useCase.execute({ userId: 'user-001', targetUserId: 'user-001', userRole: UserRole.CANDIDATE });
    expect(result.cvs).toHaveLength(1);
    expect(cvRepo.findByUserId).toHaveBeenCalledWith('user-001');
  });

  it('UT_F07_08 – ADMIN xem CV của người dùng bất kỳ', async () => {
    /**
     * Test Case ID : UT_F07_08
     * Test Objective: Admin có thể xem CV của bất kỳ user nào
     * Input         : userId=admin, targetUserId=other-user, userRole=ADMIN
     * Expected Output: Danh sách CV của other-user trả về
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findByIdWithRelations: jest.fn(),
      countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue([buildCV({ userId: 'other-user' })]), update: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(buildUser({ id: 'other-user' })),
    };
    const useCase = new GetCVsByUserUseCase(cvRepo, userRepo);

    const result = await useCase.execute({ userId: 'admin-001', targetUserId: 'other-user', userRole: UserRole.ADMIN });
    expect(result.cvs).toHaveLength(1);
  });

  it('UT_F07_09 – Thất bại khi CANDIDATE xem CV người khác', async () => {
    /**
     * Test Case ID : UT_F07_09
     * Test Objective: CANDIDATE không có quyền xem CV của người khác
     * Input         : userId="user-001", targetUserId="other-user", userRole=CANDIDATE
     * Expected Output: AuthorizationError
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findByIdWithRelations: jest.fn(),
      countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn(), update: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(buildUser({ id: 'other-user' })),
    };
    const useCase = new GetCVsByUserUseCase(cvRepo, userRepo);

    await expect(useCase.execute({ userId: 'user-001', targetUserId: 'other-user', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(AuthorizationError);
    expect(cvRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('UT_F07_10 – NotFoundError khi targetUserId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F07_10
     * Test Objective: Lỗi khi người dùng mục tiêu không có trong DB
     * Input         : targetUserId="ghost-user"
     * Expected Output: NotFoundError "Không tìm thấy người dùng"
     */
    const cvRepo: jest.Mocked<ICVRepository> = {
      save: jest.fn(), findByIdWithRelations: jest.fn(),
      countByUserId: jest.fn(), unsetMainForUser: jest.fn(),
      findByUserId: jest.fn(), update: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetCVsByUserUseCase(cvRepo, userRepo);

    await expect(useCase.execute({ userId: 'user-001', targetUserId: 'ghost-user', userRole: UserRole.CANDIDATE }))
      .rejects.toThrow(NotFoundError);
  });
});
