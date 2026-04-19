/**
 * @file SQA03_Nhom7_UT_CompanyProfile.test.ts
 * @module F06_QuanLyHoSoCongTy
 * @description Unit tests for RegisterCompanyUseCase & UpdateCompanyUseCase
 *              F06: Quản lý hồ sơ công ty (Nhà tuyển dụng)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Đăng ký công ty mới thành công bởi CANDIDATE
 *  - Thất bại khi user đã là RECRUITER
 *  - Thất bại khi user là ADMIN
 *  - Thất bại khi tên công ty đã tồn tại
 *  - Thất bại khi không có file tài liệu
 *  - Thất bại khi user đã có đơn chờ duyệt
 *  - Cập nhật thông tin công ty thành công (OWNER)
 *  - Thất bại khi không phải member của công ty
 *  - Thất bại khi là MEMBER thường (không phải OWNER/MANAGER)
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole    { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum CompanyRole { OWNER = 'OWNER', MANAGER = 'MANAGER', RECRUITER = 'RECRUITER', MEMBER = 'MEMBER' }

class ConflictError extends Error {
  statusCode = 409;
  constructor(msg: string) { super(msg); this.name = 'ConflictError'; }
}
class ValidationError extends Error {
  statusCode = 400;
  constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
}
class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface ICompanyRepository {
  nameExists(name: string, excludeId?: string): Promise<boolean>;
  save(data: any): Promise<any>;
  findById(id: string): Promise<any | null>;
  findByIdWithMembers(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}
interface ICompanyMemberRepository {
  findByUserId(userId: string): Promise<any | null>;
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
  save(data: any): Promise<any>;
  delete(id: string): Promise<any>;
}
interface IUserRepository {
  findById(id: string): Promise<any | null>;
  findAll(opts: any): Promise<{ data: any[] }>;
}
interface IStorageService {
  uploadDocument(buffer: Buffer, name: string, mime: string): Promise<string>;
  uploadImage(buffer: Buffer, name: string, mime: string, folder: string): Promise<string>;
  deleteFile(url: string): Promise<void>;
}
interface INotificationService {
  createNotification(data: any): Promise<any>;
}

class RegisterCompanyUseCase {
  constructor(
    private companyRepo: ICompanyRepository,
    private memberRepo: ICompanyMemberRepository,
    private userRepo: IUserRepository,
    private storageService: IStorageService,
    private notificationService: INotificationService,
  ) {}

  async execute(input: {
    ownerId?: string;
    userId?: string;
    name: string;
    website?: string;
    description?: string;
    industry?: string;
    companySize?: string;
    address?: string;
    phone?: string;
    email?: string;
    documentFile?: { buffer: Buffer; originalname: string; mimetype: string };
    logoFile?: { buffer: Buffer; originalname: string; mimetype: string };
  }) {
    const ownerId = input.ownerId ?? input.userId!;

    const user = await this.userRepo.findById(ownerId);
    if (!user) throw new ValidationError('Người dùng không tồn tại');

    if (user.role === UserRole.RECRUITER)
      throw new ConflictError('Bạn đã là nhà tuyển dụng của một công ty.');
    if (user.role === UserRole.ADMIN)
      throw new ConflictError('Tài khoản quản trị viên không thể đăng ký công ty.');

    const existingMember = await this.memberRepo.findByUserId(ownerId);
    if (existingMember) {
      const existingCompany = await this.companyRepo.findById(existingMember.companyId);
      if (existingCompany?.status === 'PENDING')
        throw new ConflictError('Bạn đã có đơn đăng ký công ty đang chờ xét duyệt.');
    }

    const nameExists = await this.companyRepo.nameExists(input.name);
    if (nameExists) throw new ConflictError('Tên công ty đã tồn tại');

    if (!input.documentFile) throw new ValidationError('Tài liệu đăng ký công ty là bắt buộc');

    const documentUrl = await this.storageService.uploadDocument(
      input.documentFile.buffer,
      input.documentFile.originalname,
      input.documentFile.mimetype,
    );

    const company = await this.companyRepo.save({
      name: input.name,
      documentUrl,
      status: 'PENDING',
    });

    await this.memberRepo.save({ userId: ownerId, companyId: company.id, companyRole: CompanyRole.OWNER });

    const admins = await this.userRepo.findAll({ role: UserRole.ADMIN, page: 1, limit: 100 });
    for (const admin of admins.data) {
      await this.notificationService.createNotification({
        userId: admin.id, type: 'COMPANY_REGISTRATION', title: 'Đăng ký công ty mới',
        message: `Công ty "${company.name}" đã đăng ký`, data: { companyId: company.id },
      });
    }

    return await this.companyRepo.findByIdWithMembers(company.id);
  }
}

class UpdateCompanyUseCase {
  constructor(
    private companyRepo: ICompanyRepository,
    private memberRepo: ICompanyMemberRepository,
    private storageService: IStorageService,
  ) {}

  async execute(input: {
    companyId: string;
    userId: string;
    name?: string;
    description?: string;
    address?: string;
    logoFile?: { buffer: Buffer; originalname: string; mimetype: string };
  }) {
    const company = await this.companyRepo.findByIdWithMembers(input.companyId);
    if (!company) throw new NotFoundError('Company not found');

    const member = await this.memberRepo.findByCompanyAndUser(input.companyId, input.userId);
    if (!member) throw new AuthorizationError('You are not a member of this company');

    if (member.companyRole !== CompanyRole.OWNER && member.companyRole !== CompanyRole.MANAGER)
      throw new AuthorizationError('Only owners and managers can update company information');

    if (input.name && input.name !== company.name) {
      const nameExists = await this.companyRepo.nameExists(input.name, input.companyId);
      if (nameExists) throw new ConflictError('Company name already exists');
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.address !== undefined) updateData.address = input.address;

    await this.companyRepo.update(input.companyId, updateData);
    return await this.companyRepo.findByIdWithMembers(input.companyId);
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildUser = (overrides: any = {}) => ({
  id: 'user-001',
  email: 'user@example.com',
  role: UserRole.CANDIDATE,
  ...overrides,
});

const buildCompany = (overrides: any = {}) => ({
  id: 'company-001',
  name: 'New Company',
  status: 'PENDING',
  documentUrl: 'https://storage.example.com/doc.pdf',
  members: [],
  ...overrides,
});

const buildMember = (overrides: any = {}) => ({
  id: 'member-001',
  userId: 'user-001',
  companyId: 'company-001',
  companyRole: CompanyRole.OWNER,
  ...overrides,
});

const dummyFile = { buffer: Buffer.from('dummy'), originalname: 'doc.pdf', mimetype: 'application/pdf' };

// =====================================================================
// TEST SUITE: RegisterCompanyUseCase
// =====================================================================
describe('F06 - Đăng ký công ty | RegisterCompanyUseCase', () => {

  const makeDeps = (userOverrides: any = {}, companyOverrides: any = {}) => {
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      nameExists: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(buildCompany(companyOverrides)),
      findById: jest.fn().mockResolvedValue(null),
      findByIdWithMembers: jest.fn().mockResolvedValue(buildCompany(companyOverrides)),
      update: jest.fn(),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn().mockResolvedValue(null),
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(buildMember()),
      delete: jest.fn(),
    };
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(buildUser(userOverrides)),
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    };
    const storageSvc: jest.Mocked<IStorageService> = {
      uploadDocument: jest.fn().mockResolvedValue('https://storage.example.com/doc.pdf'),
      uploadImage: jest.fn(),
      deleteFile: jest.fn(),
    };
    const notificationSvc: jest.Mocked<INotificationService> = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    return { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc };
  };

  it('UT_F06_01 – CANDIDATE đăng ký công ty mới thành công', async () => {
    /**
     * Test Case ID : UT_F06_01
     * Test Objective: Ứng viên có thể đăng ký công ty mới, tài liệu được upload
     * Input         : name="New Company", documentFile hợp lệ, user.role=CANDIDATE
     * Expected Output: Công ty được tạo với status=PENDING; member OWNER được tạo
     * Notes         : CheckDB – companyRepo.save() và memberRepo.save() phải được gọi 1 lần
     *                 Rollback – mock; không thay đổi DB thực
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps();
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    const result = await useCase.execute({ userId: 'user-001', name: 'New Company', documentFile: dummyFile });

    expect(result).toBeTruthy();
    expect(companyRepo.save).toHaveBeenCalledTimes(1);
    expect(memberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-001', companyRole: CompanyRole.OWNER })
    );
    expect(storageSvc.uploadDocument).toHaveBeenCalledTimes(1);
  });

  it('UT_F06_02 – Thất bại khi user đã là RECRUITER', async () => {
    /**
     * Test Case ID : UT_F06_02
     * Test Objective: RECRUITER không thể đăng ký thêm công ty
     * Input         : user.role=RECRUITER
     * Expected Output: ConflictError
     * Notes         : CheckDB – companyRepo.save() KHÔNG được gọi
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps({ role: UserRole.RECRUITER });
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    await expect(useCase.execute({ userId: 'user-001', name: 'Test', documentFile: dummyFile }))
      .rejects.toThrow(ConflictError);
    expect(companyRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F06_03 – Thất bại khi user là ADMIN', async () => {
    /**
     * Test Case ID : UT_F06_03
     * Test Objective: ADMIN không thể đăng ký công ty
     * Input         : user.role=ADMIN
     * Expected Output: ConflictError "Tài khoản quản trị viên không thể đăng ký công ty"
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps({ role: UserRole.ADMIN });
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    await expect(useCase.execute({ userId: 'user-001', name: 'Test', documentFile: dummyFile }))
      .rejects.toThrow(/quản trị viên/);
  });

  it('UT_F06_04 – Thất bại khi tên công ty đã tồn tại', async () => {
    /**
     * Test Case ID : UT_F06_04
     * Test Objective: Không cho phép trùng tên công ty
     * Input         : nameExists() trả về true
     * Expected Output: ConflictError "Tên công ty đã tồn tại"
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps();
    companyRepo.nameExists.mockResolvedValue(true);
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    await expect(useCase.execute({ userId: 'user-001', name: 'Existing Company', documentFile: dummyFile }))
      .rejects.toThrow(/tên công ty/i);
  });

  it('UT_F06_05 – Thất bại khi không có file tài liệu', async () => {
    /**
     * Test Case ID : UT_F06_05
     * Test Objective: Tài liệu đăng ký là bắt buộc
     * Input         : documentFile=undefined
     * Expected Output: ValidationError "Tài liệu đăng ký công ty là bắt buộc"
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps();
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    await expect(useCase.execute({ userId: 'user-001', name: 'Test' }))
      .rejects.toThrow(ValidationError);
  });

  it('UT_F06_06 – Thất bại khi user đã có đơn chờ duyệt (PENDING)', async () => {
    /**
     * Test Case ID : UT_F06_06
     * Test Objective: Không cho phép đăng ký nhiều công ty khi đang chờ duyệt
     * Input         : existingMember với company.status=PENDING
     * Expected Output: ConflictError "đang chờ xét duyệt"
     */
    const { companyRepo, memberRepo, userRepo, storageSvc, notificationSvc } = makeDeps();
    memberRepo.findByUserId.mockResolvedValue({ companyId: 'old-company' });
    companyRepo.findById.mockResolvedValue({ status: 'PENDING' });
    const useCase = new RegisterCompanyUseCase(companyRepo, memberRepo, userRepo, storageSvc, notificationSvc);

    await expect(useCase.execute({ userId: 'user-001', name: 'New', documentFile: dummyFile }))
      .rejects.toThrow(/chờ xét duyệt/);
  });
});

// =====================================================================
// TEST SUITE: UpdateCompanyUseCase
// =====================================================================
describe('F06 - Cập nhật hồ sơ công ty | UpdateCompanyUseCase', () => {

  it('UT_F06_07 – OWNER cập nhật thông tin công ty thành công', async () => {
    /**
     * Test Case ID : UT_F06_07
     * Test Objective: Chủ công ty cập nhật thông tin hợp lệ
     * Input         : userId="user-001", companyRole=OWNER, new name="Updated Company"
     * Expected Output: update() được gọi; trả về thông tin mới
     * Notes         : CheckDB – companyRepo.update() phải được gọi 1 lần
     */
    const companyData = buildCompany({ status: 'ACTIVE', name: 'Old Name' });
    const updatedCompany = buildCompany({ name: 'Updated Company', status: 'ACTIVE' });
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      nameExists: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
      findById: jest.fn(),
      findByIdWithMembers: jest.fn()
        .mockResolvedValueOnce(companyData)    // for initial fetch
        .mockResolvedValueOnce(updatedCompany), // after update
      update: jest.fn().mockResolvedValue(updatedCompany),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember({ companyRole: CompanyRole.OWNER })),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const storageSvc: jest.Mocked<IStorageService> = {
      uploadDocument: jest.fn(),
      uploadImage: jest.fn(),
      deleteFile: jest.fn(),
    };
    const useCase = new UpdateCompanyUseCase(companyRepo, memberRepo, storageSvc);

    const result = await useCase.execute({
      companyId: 'company-001',
      userId: 'user-001',
      name: 'Updated Company',
    });

    expect(companyRepo.update).toHaveBeenCalledWith('company-001', expect.objectContaining({ name: 'Updated Company' }));
    expect(result.name).toBe('Updated Company');
  });

  it('UT_F06_08 – Thất bại khi không phải member của công ty', async () => {
    /**
     * Test Case ID : UT_F06_08
     * Test Objective: User không thuộc công ty không được cập nhật
     * Input         : findByCompanyAndUser() trả về null
     * Expected Output: AuthorizationError
     */
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByIdWithMembers: jest.fn().mockResolvedValue(buildCompany({ status: 'ACTIVE' })),
      update: jest.fn(),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const storageSvc: jest.Mocked<IStorageService> = { uploadDocument: jest.fn(), uploadImage: jest.fn(), deleteFile: jest.fn() };
    const useCase = new UpdateCompanyUseCase(companyRepo, memberRepo, storageSvc);

    await expect(useCase.execute({ companyId: 'company-001', userId: 'other-user', name: 'Test' }))
      .rejects.toThrow(AuthorizationError);
    expect(companyRepo.update).not.toHaveBeenCalled();
  });

  it('UT_F06_09 – Thất bại khi member có role thấp (MEMBER không phải OWNER/MANAGER)', async () => {
    /**
     * Test Case ID : UT_F06_09
     * Test Objective: MEMBER thường không được phép cập nhật hồ sơ công ty
     * Input         : companyRole=MEMBER
     * Expected Output: AuthorizationError "Only owners and managers can update"
     */
    const companyRepo: jest.Mocked<ICompanyRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByIdWithMembers: jest.fn().mockResolvedValue(buildCompany({ status: 'ACTIVE' })),
      update: jest.fn(),
    };
    const memberRepo: jest.Mocked<ICompanyMemberRepository> = {
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember({ companyRole: CompanyRole.MEMBER })),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const storageSvc: jest.Mocked<IStorageService> = { uploadDocument: jest.fn(), uploadImage: jest.fn(), deleteFile: jest.fn() };
    const useCase = new UpdateCompanyUseCase(companyRepo, memberRepo, storageSvc);

    await expect(useCase.execute({ companyId: 'company-001', userId: 'user-001', name: 'Test' }))
      .rejects.toThrow(/owners and managers/i);
  });
});
