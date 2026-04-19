/**
 * Unit tests: CreateTemplateUseCase
 * Module: Quản lý mẫu CV (Admin)
 *
 * Lưu ý: Use case gọi repository + file storage — DB và storage thật được thay bằng mock (chỉ unit test).
 */

import { CreateTemplateUseCase } from '../../../src/modules/cv/application/use-cases/CreateTemplateUseCase';
import type { ICVTemplateRepository } from '../../../src/modules/cv/domain/repositories/ICVTemplateRepository';
import type { IFileStorageService } from '../../../src/shared/domain/services/IFileStorageService';
import { UserRole } from '../../../src/modules/user/domain/enums/UserRole';
import { AuthorizationError, ConflictError, ValidationError } from '../../../src/shared/domain/errors/index';
import {
  buildCvTemplateDomain,
  buildValidHtmlTemplateFile,
  buildValidPreviewImageFile,
} from '../helpers/cvTemplateTestFactories';

function createMockCvTemplateRepository(): jest.Mocked<ICVTemplateRepository> {
  return {
    findById: jest.fn(),
    findAll: jest.fn(),
    findActive: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    nameExists: jest.fn(),
    hasAssociatedCVs: jest.fn(),
  };
}

function createMockFileStorageService(): jest.Mocked<IFileStorageService> {
  return {
    validateHtmlFile: jest.fn(),
    validateImageFile: jest.fn(),
    uploadFile: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IFileStorageService>;
}

describe('CreateTemplateUseCase', () => {
  let mockRepository: jest.Mocked<ICVTemplateRepository>;
  let mockFileStorage: jest.Mocked<IFileStorageService>;
  let useCaseUnderTest: CreateTemplateUseCase;

  beforeEach(() => {
    mockRepository = createMockCvTemplateRepository();
    mockFileStorage = createMockFileStorageService();
    useCaseUnderTest = new CreateTemplateUseCase({
      cvTemplateRepository: mockRepository,
      fileStorageService: mockFileStorage,
    });
  });

  /**
   * CVT_UT_001
   * Mục tiêu: Admin tạo mẫu chỉ với htmlUrl (không upload file) — thành công.
   */
  it('CVT_UT_001 should create template when admin provides htmlUrl only', async () => {
    mockRepository.nameExists.mockResolvedValue(false);
    const savedTemplate = buildCvTemplateDomain({ name: 'Mẫu A' });
    mockRepository.save.mockImplementation(async (t) => t);

    const result = await useCaseUnderTest.execute({
      userRole: UserRole.ADMIN,
      name: 'Mẫu A',
      htmlUrl: 'https://cdn.example.com/t.html',
      previewUrl: 'https://cdn.example.com/p.png',
      isActive: true,
    });

    expect(mockRepository.nameExists).toHaveBeenCalledWith('Mẫu A');
    expect(mockFileStorage.uploadFile).not.toHaveBeenCalled();
    expect(result.name).toBe('Mẫu A');
    expect(result.htmlUrl).toBe('https://cdn.example.com/t.html');
  });

  /**
   * CVT_UT_002
   * Mục tiêu: Người không phải ADMIN bị từ chối (AuthorizationError).
   */
  it('CVT_UT_002 should reject when user is not admin', async () => {
    await expect(
      useCaseUnderTest.execute({
        userRole: UserRole.RECRUITER,
        name: 'Mẫu X',
        htmlUrl: 'https://cdn.example.com/t.html',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  /**
   * CVT_UT_003
   * Mục tiêu: Thiếu cả htmlUrl và templateFile → ValidationError.
   */
  it('CVT_UT_003 should reject when neither htmlUrl nor templateFile is provided', async () => {
    await expect(
      useCaseUnderTest.execute({
        userRole: UserRole.ADMIN,
        name: 'Mẫu thiếu file',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  /**
   * CVT_UT_004
   * Mục tiêu: Trùng tên mẫu → ConflictError, không gọi save.
   */
  it('CVT_UT_004 should reject when template name already exists', async () => {
    mockRepository.nameExists.mockResolvedValue(true);

    await expect(
      useCaseUnderTest.execute({
        userRole: UserRole.ADMIN,
        name: 'Trùng tên',
        htmlUrl: 'https://cdn.example.com/t.html',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  /**
   * CVT_UT_005
   * Mục tiêu: File HTML không hợp lệ theo storage → ValidationError, không upload.
   */
  it('CVT_UT_005 should reject invalid HTML file before upload', async () => {
    mockRepository.nameExists.mockResolvedValue(false);
    mockFileStorage.validateHtmlFile.mockReturnValue({ isValid: false, error: 'Chỉ chấp nhận .html' });

    await expect(
      useCaseUnderTest.execute({
        userRole: UserRole.ADMIN,
        name: 'Mẫu file lỗi',
        templateFile: buildValidHtmlTemplateFile(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockFileStorage.uploadFile).not.toHaveBeenCalled();
  });

  /**
   * CVT_UT_006
   * Mục tiêu: Upload HTML + preview thành công, save trả về entity đầy đủ.
   */
  it('CVT_UT_006 should upload files and persist template for admin', async () => {
    mockRepository.nameExists.mockResolvedValue(false);
    mockFileStorage.validateHtmlFile.mockReturnValue({ isValid: true });
    mockFileStorage.validateImageFile.mockReturnValue({ isValid: true });
    mockFileStorage.uploadFile
      .mockResolvedValueOnce('https://storage/html-uploaded.html')
      .mockResolvedValueOnce('https://storage/preview-uploaded.png');

    const created = buildCvTemplateDomain({
      htmlUrl: 'https://storage/html-uploaded.html',
      previewUrl: 'https://storage/preview-uploaded.png',
    });
    mockRepository.save.mockResolvedValue(created);

    const output = await useCaseUnderTest.execute({
      userRole: UserRole.ADMIN,
      name: 'Mẫu upload',
      templateFile: buildValidHtmlTemplateFile(),
      previewFile: buildValidPreviewImageFile(),
    });

    expect(mockFileStorage.uploadFile).toHaveBeenCalledTimes(2);
    expect(output.htmlUrl).toContain('html-uploaded');
    expect(output.previewUrl).toContain('preview-uploaded');
  });

  /**
   * CVT_UT_007
   * Mục tiêu: Sau khi upload thành công mà save thất bại → rollback gọi deleteFile cho file đã upload.
   */
  it('CVT_UT_007 should delete uploaded files when save fails after upload', async () => {
    mockRepository.nameExists.mockResolvedValue(false);
    mockFileStorage.validateHtmlFile.mockReturnValue({ isValid: true });
    mockFileStorage.uploadFile.mockResolvedValue('https://storage/new.html');
    mockRepository.save.mockRejectedValue(new Error('DB save failed'));

    await expect(
      useCaseUnderTest.execute({
        userRole: UserRole.ADMIN,
        name: 'Mẫu rollback',
        templateFile: buildValidHtmlTemplateFile(),
      }),
    ).rejects.toThrow('DB save failed');

    expect(mockFileStorage.deleteFile).toHaveBeenCalledWith('https://storage/new.html');
  });
});
