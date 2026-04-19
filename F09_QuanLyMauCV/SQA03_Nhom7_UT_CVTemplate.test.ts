/**
 * @file SQA03_Nhom7_UT_CVTemplate.test.ts
 * @module F09_QuanLyMauCV
 * @description Unit tests for CreateTemplateUseCase & GetActiveTemplatesUseCase
 *              F09: Quản lý mẫu CV (Quản trị viên)
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Admin tạo template mới thành công
 *  - Thất bại khi không phải ADMIN
 *  - Thất bại khi không có htmlUrl hoặc templateFile
 *  - Thất bại khi tên template đã tồn tại
 *  - Rollback upload khi create() thất bại
 *  - Lấy danh sách template đang active với phân trang
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}
class ValidationError extends Error {
  statusCode = 400;
  constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
}
class ConflictError extends Error {
  statusCode = 409;
  constructor(msg: string) { super(msg); this.name = 'ConflictError'; }
}

// =====================================================================
// INLINE USE CASES
// =====================================================================
interface ICVTemplateRepository {
  nameExists(name: string): Promise<boolean>;
  save(template: any): Promise<any>;
  findActive(opts: any): Promise<{ data: any[]; pagination: any }>;
}
interface IFileStorageService {
  validateHtmlFile(file: any): { isValid: boolean; error?: string };
  validateImageFile(file: any): { isValid: boolean; error?: string };
  uploadFile(file: any, folder: string): Promise<string>;
  deleteFile(url: string): Promise<void>;
}

class CreateTemplateUseCase {
  constructor(
    private templateRepo: ICVTemplateRepository,
    private fileStorageSvc: IFileStorageService,
  ) {}

  async execute(input: {
    userRole: string;
    name: string;
    htmlUrl?: string;
    previewUrl?: string;
    isActive?: boolean;
    templateFile?: any;
    previewFile?: any;
  }) {
    if (input.userRole !== UserRole.ADMIN)
      throw new AuthorizationError('Only admins can create templates');

    if (!input.htmlUrl && !input.templateFile)
      throw new ValidationError('Either HTML URL or template file is required');

    const nameExists = await this.templateRepo.nameExists(input.name);
    if (nameExists) throw new ConflictError('Template with this name already exists');

    let htmlUrl = input.htmlUrl;
    let uploadedHtmlUrl: string | null = null;
    let uploadedPreviewUrl: string | null = null;

    try {
      if (input.templateFile) {
        const validation = this.fileStorageSvc.validateHtmlFile(input.templateFile);
        if (!validation.isValid) throw new ValidationError(validation.error ?? 'Invalid template file');
        uploadedHtmlUrl = await this.fileStorageSvc.uploadFile(input.templateFile, 'cv-templates');
        htmlUrl = uploadedHtmlUrl;
      }

      let previewUrl = input.previewUrl;
      if (input.previewFile) {
        const validation = this.fileStorageSvc.validateImageFile(input.previewFile);
        if (!validation.isValid) throw new ValidationError(validation.error ?? 'Invalid preview file');
        uploadedPreviewUrl = await this.fileStorageSvc.uploadFile(input.previewFile, 'cv-template-previews');
        previewUrl = uploadedPreviewUrl;
      }

      const created = await this.templateRepo.save({
        name: input.name,
        htmlUrl: htmlUrl!,
        previewUrl: previewUrl ?? null,
        isActive: input.isActive ?? true,
      });

      return {
        id: created.id,
        name: created.name,
        htmlUrl: created.htmlUrl,
        previewUrl: created.previewUrl,
        isActive: created.isActive,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    } catch (error) {
      if (uploadedHtmlUrl)
        await this.fileStorageSvc.deleteFile(uploadedHtmlUrl).catch(() => {});
      if (uploadedPreviewUrl)
        await this.fileStorageSvc.deleteFile(uploadedPreviewUrl).catch(() => {});
      throw error;
    }
  }
}

class GetActiveTemplatesUseCase {
  constructor(private templateRepo: ICVTemplateRepository) {}

  async execute(input: { page?: number; limit?: number }) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 10;

    const result = await this.templateRepo.findActive({
      page, limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: result.data.map((t: any) => ({
        id: t.id, name: t.name, htmlUrl: t.htmlUrl,
        previewUrl: t.previewUrl, isActive: t.isActive,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      })),
      pagination: result.pagination,
    };
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildTemplate = (overrides: any = {}) => ({
  id: 'template-001',
  name: 'Classic Template',
  htmlUrl: 'https://storage.example.com/templates/classic.html',
  previewUrl: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const dummyHtmlFile = {
  buffer: Buffer.from('<html>...</html>'),
  originalname: 'template.html',
  mimetype: 'text/html',
  size: 100,
};

// =====================================================================
// TEST SUITE: CreateTemplateUseCase
// =====================================================================
describe('F09 - Tạo mẫu CV | CreateTemplateUseCase', () => {

  it('UT_F09_01 – ADMIN tạo template mới với htmlUrl thành công', async () => {
    /**
     * Test Case ID : UT_F09_01
     * Test Objective: Admin tạo template với URL HTML trực tiếp
     * Input         : userRole=ADMIN, name="Classic Template", htmlUrl="https://..."
     * Expected Output: Template được tạo với isActive=true
     * Notes         : CheckDB – templateRepo.save() phải được gọi 1 lần
     *                 Rollback – mock; không thay đổi DB thực
     */
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(buildTemplate()),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn().mockReturnValue({ isValid: true }),
      validateImageFile: jest.fn().mockReturnValue({ isValid: true }),
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    const result = await useCase.execute({
      userRole: UserRole.ADMIN,
      name: 'Classic Template',
      htmlUrl: 'https://storage.example.com/templates/classic.html',
    });

    expect(result.id).toBe('template-001');
    expect(result.isActive).toBe(true);
    expect(templateRepo.save).toHaveBeenCalledTimes(1);
    expect(templateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Classic Template', isActive: true })
    );
  });

  it('UT_F09_02 – Thất bại khi không phải ADMIN', async () => {
    /**
     * Test Case ID : UT_F09_02
     * Test Objective: Non-admin không được tạo template
     * Input         : userRole=RECRUITER
     * Expected Output: AuthorizationError "Only admins can create templates"
     * Notes         : CheckDB – save() KHÔNG được gọi
     */
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn(), validateImageFile: jest.fn(),
      uploadFile: jest.fn(), deleteFile: jest.fn(),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    await expect(useCase.execute({
      userRole: UserRole.RECRUITER,
      name: 'Template',
      htmlUrl: 'https://example.com/template.html',
    })).rejects.toThrow(AuthorizationError);
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F09_03 – Thất bại khi không cung cấp htmlUrl và templateFile', async () => {
    /**
     * Test Case ID : UT_F09_03
     * Test Objective: Cần ít nhất một nguồn HTML
     * Input         : htmlUrl=undefined, templateFile=undefined
     * Expected Output: ValidationError "Either HTML URL or template file is required"
     */
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn(), validateImageFile: jest.fn(),
      uploadFile: jest.fn(), deleteFile: jest.fn(),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    await expect(useCase.execute({ userRole: UserRole.ADMIN, name: 'No Source' }))
      .rejects.toThrow(ValidationError);
  });

  it('UT_F09_04 – Thất bại khi tên template đã tồn tại', async () => {
    /**
     * Test Case ID : UT_F09_04
     * Test Objective: Tên template phải là duy nhất
     * Input         : nameExists() trả về true
     * Expected Output: ConflictError "Template with this name already exists"
     */
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn(), validateImageFile: jest.fn(),
      uploadFile: jest.fn(), deleteFile: jest.fn(),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    await expect(useCase.execute({
      userRole: UserRole.ADMIN, name: 'Existing Template',
      htmlUrl: 'https://example.com/template.html',
    })).rejects.toThrow(ConflictError);
    expect(templateRepo.save).not.toHaveBeenCalled();
  });

  it('UT_F09_05 – ADMIN tạo template với file upload, file được upload trước', async () => {
    /**
     * Test Case ID : UT_F09_05
     * Test Objective: Khi truyền templateFile, file phải được upload trước khi save
     * Input         : templateFile=dummyHtmlFile
     * Expected Output: uploadFile() được gọi; save() nhận htmlUrl từ upload
     */
    const uploadedUrl = 'https://storage.example.com/cv-templates/uuid.html';
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(buildTemplate({ htmlUrl: uploadedUrl })),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn().mockReturnValue({ isValid: true }),
      validateImageFile: jest.fn().mockReturnValue({ isValid: true }),
      uploadFile: jest.fn().mockResolvedValue(uploadedUrl),
      deleteFile: jest.fn(),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    await useCase.execute({ userRole: UserRole.ADMIN, name: 'File Template', templateFile: dummyHtmlFile });

    expect(fileStorageSvc.uploadFile).toHaveBeenCalledWith(dummyHtmlFile, 'cv-templates');
    expect(templateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ htmlUrl: uploadedUrl })
    );
  });

  it('UT_F09_06 – Rollback: file upload bị xóa khi save() thất bại', async () => {
    /**
     * Test Case ID : UT_F09_06
     * Test Objective: Nếu save() thất bại, file đã upload phải được xóa (rollback)
     * Input         : templateFile hợp lệ, save() ném lỗi
     * Expected Output: deleteFile() được gọi với URL đã upload
     * Notes         : Rollback – đây là test trực tiếp xác minh cơ chế rollback
     */
    const uploadedUrl = 'https://storage.example.com/cv-templates/uuid.html';
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockRejectedValue(new Error('DB error')),
      findActive: jest.fn(),
    };
    const fileStorageSvc: jest.Mocked<IFileStorageService> = {
      validateHtmlFile: jest.fn().mockReturnValue({ isValid: true }),
      validateImageFile: jest.fn().mockReturnValue({ isValid: true }),
      uploadFile: jest.fn().mockResolvedValue(uploadedUrl),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new CreateTemplateUseCase(templateRepo, fileStorageSvc);

    await expect(useCase.execute({
      userRole: UserRole.ADMIN, name: 'Rollback Template', templateFile: dummyHtmlFile,
    })).rejects.toThrow('DB error');

    expect(fileStorageSvc.deleteFile).toHaveBeenCalledWith(uploadedUrl);
  });
});

// =====================================================================
// TEST SUITE: GetActiveTemplatesUseCase
// =====================================================================
describe('F09 - Lấy danh sách mẫu CV đang hoạt động | GetActiveTemplatesUseCase', () => {

  it('UT_F09_07 – Lấy danh sách active templates thành công', async () => {
    /**
     * Test Case ID : UT_F09_07
     * Test Objective: Trả về danh sách template với phân trang đúng
     * Input         : page=1, limit=10
     * Expected Output: { data: [...], pagination: {...} }
     */
    const templates = [buildTemplate(), buildTemplate({ id: 'template-002', name: 'Modern Template' })];
    const pagination = { page: 1, limit: 10, total: 2, totalPages: 1 };
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findActive: jest.fn().mockResolvedValue({ data: templates, pagination }),
    };
    const useCase = new GetActiveTemplatesUseCase(templateRepo);

    const result = await useCase.execute({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(templateRepo.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 })
    );
  });

  it('UT_F09_08 – Phân trang mặc định page=1 limit=10', async () => {
    /**
     * Test Case ID : UT_F09_08
     * Test Objective: Giá trị mặc định được sử dụng khi không truyền page/limit
     * Input         : {}
     * Expected Output: findActive() nhận page=1, limit=10
     */
    const templateRepo: jest.Mocked<ICVTemplateRepository> = {
      nameExists: jest.fn(),
      save: jest.fn(),
      findActive: jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    };
    const useCase = new GetActiveTemplatesUseCase(templateRepo);

    await useCase.execute({});

    expect(templateRepo.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 })
    );
  });
});
