/**
 * Unit tests: UpdateTemplateUseCase
 * Module: Quản lý mẫu CV (Admin)
 */

import { UpdateTemplateUseCase } from '../../../src/modules/cv/application/use-cases/UpdateTemplateUseCase';
import type { ICVTemplateRepository } from '../../../src/modules/cv/domain/repositories/ICVTemplateRepository';
import type { IFileStorageService } from '../../../src/shared/domain/services/IFileStorageService';
import { UserRole } from '../../../src/modules/user/domain/enums/UserRole';
import { AuthorizationError, ConflictError, NotFoundError } from '../../../src/shared/domain/errors/index';
import { buildCvTemplateDomain, buildValidHtmlTemplateFile } from '../helpers/cvTemplateTestFactories';

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

describe('UpdateTemplateUseCase', () => {
  let mockRepository: jest.Mocked<ICVTemplateRepository>;
  let mockFileStorage: jest.Mocked<IFileStorageService>;
  let useCaseUnderTest: UpdateTemplateUseCase;

  const templateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    mockRepository = createMockCvTemplateRepository();
    mockFileStorage = createMockFileStorageService();
    useCaseUnderTest = new UpdateTemplateUseCase({
      cvTemplateRepository: mockRepository,
      fileStorageService: mockFileStorage,
    });
  });

  /**
   * CVT_UT_010
   * Mục tiêu: Không phải admin → AuthorizationError.
   */
  it('CVT_UT_010 should reject update for non-admin', async () => {
    mockRepository.findById.mockResolvedValue(buildCvTemplateDomain({ id: templateId }));

    await expect(
      useCaseUnderTest.execute({
        templateId,
        userRole: UserRole.CANDIDATE,
        name: 'Hack',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  /**
   * CVT_UT_011
   * Mục tiêu: Không tìm thấy mẫu → NotFoundError.
   */
  it('CVT_UT_011 should reject when template does not exist', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      useCaseUnderTest.execute({
        templateId,
        userRole: UserRole.ADMIN,
        name: 'Mới',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * CVT_UT_012
   * Mục tiêu: Đổi tên trùng tên mẫu khác → ConflictError.
   */
  it('CVT_UT_012 should reject when new name conflicts with another template', async () => {
    mockRepository.findById.mockResolvedValue(
      buildCvTemplateDomain({ id: templateId, name: 'Tên cũ' }),
    );
    mockRepository.nameExists.mockResolvedValue(true);

    await expect(
      useCaseUnderTest.execute({
        templateId,
        userRole: UserRole.ADMIN,
        name: 'Tên đã có',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  /**
   * CVT_UT_013
   * Mục tiêu: Cập nhật chỉ isActive — không đổi tên → không gọi nameExists.
   */
  it('CVT_UT_013 should skip name check when name unchanged', async () => {
    const existing = buildCvTemplateDomain({ id: templateId, name: 'Giữ nguyên' });
    mockRepository.findById.mockResolvedValue(existing);
    const updated = existing.with({ isActive: false });
    mockRepository.update.mockResolvedValue(updated);

    await useCaseUnderTest.execute({
      templateId,
      userRole: UserRole.ADMIN,
      isActive: false,
    });

    expect(mockRepository.nameExists).not.toHaveBeenCalled();
    expect(mockRepository.update).toHaveBeenCalledWith(templateId, expect.objectContaining({ isActive: false }));
  });

  /**
   * CVT_UT_014
   * Mục tiêu: Upload HTML mới hợp lệ → update + xóa file HTML cũ.
   */
  it('CVT_UT_014 should upload new html and delete old html after successful update', async () => {
    const existing = buildCvTemplateDomain({
      id: templateId,
      htmlUrl: 'https://old/html.html',
      previewUrl: 'https://old/p.png',
    });
    mockRepository.findById.mockResolvedValue(existing);
    mockFileStorage.validateHtmlFile.mockReturnValue({ isValid: true });
    mockFileStorage.uploadFile.mockResolvedValue('https://new/html.html');
    mockRepository.update.mockResolvedValue(existing.with({ htmlUrl: 'https://new/html.html' }));

    await useCaseUnderTest.execute({
      templateId,
      userRole: UserRole.ADMIN,
      templateFile: buildValidHtmlTemplateFile(),
    });

    expect(mockFileStorage.deleteFile).toHaveBeenCalledWith('https://old/html.html');
  });

  /**
   * CVT_UT_015
   * Mục tiêu: Upload thất bại sau khi upload file mới → rollback delete file mới.
   */
  it('CVT_UT_015 should rollback new upload when update throws', async () => {
    const existing = buildCvTemplateDomain({ id: templateId });
    mockRepository.findById.mockResolvedValue(existing);
    mockFileStorage.validateHtmlFile.mockReturnValue({ isValid: true });
    mockFileStorage.uploadFile.mockResolvedValue('https://new/broken.html');
    mockRepository.update.mockRejectedValue(new Error('update failed'));

    await expect(
      useCaseUnderTest.execute({
        templateId,
        userRole: UserRole.ADMIN,
        templateFile: buildValidHtmlTemplateFile(),
      }),
    ).rejects.toThrow('update failed');

    expect(mockFileStorage.deleteFile).toHaveBeenCalledWith('https://new/broken.html');
  });
});
