/**
 * Unit tests: DeleteTemplateUseCase
 * Module: Quản lý mẫu CV (Admin)
 */

import { DeleteTemplateUseCase } from '../../../src/modules/cv/application/use-cases/DeleteTemplateUseCase';
import type { ICVTemplateRepository } from '../../../src/modules/cv/domain/repositories/ICVTemplateRepository';
import type { IFileStorageService } from '../../../src/shared/domain/services/IFileStorageService';
import { UserRole } from '../../../src/modules/user/domain/enums/UserRole';
import { AuthorizationError, ConflictError, NotFoundError } from '../../../src/shared/domain/errors/index';
import { buildCvTemplateDomain } from '../helpers/cvTemplateTestFactories';

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

describe('DeleteTemplateUseCase', () => {
  let mockRepository: jest.Mocked<ICVTemplateRepository>;
  let mockFileStorage: jest.Mocked<IFileStorageService>;
  let useCaseUnderTest: DeleteTemplateUseCase;

  const templateId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(() => {
    mockRepository = createMockCvTemplateRepository();
    mockFileStorage = createMockFileStorageService();
    useCaseUnderTest = new DeleteTemplateUseCase({
      cvTemplateRepository: mockRepository,
      fileStorageService: mockFileStorage,
    });
  });

  /**
   * CVT_UT_020
   * Mục tiêu: Non-admin không được xóa.
   */
  it('CVT_UT_020 should reject delete for non-admin', async () => {
    await expect(
      useCaseUnderTest.execute({
        templateId,
        userRole: UserRole.RECRUITER,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  /**
   * CVT_UT_021
   * Mục tiêu: Mẫu không tồn tại → NotFoundError.
   */
  it('CVT_UT_021 should reject when template not found', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      useCaseUnderTest.execute({ templateId, userRole: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  /**
   * CVT_UT_022
   * Mục tiêu: Mẫu đang được CV sử dụng → ConflictError, không xóa DB.
   */
  it('CVT_UT_022 should reject when template has associated CVs', async () => {
    mockRepository.findById.mockResolvedValue(buildCvTemplateDomain({ id: templateId }));
    mockRepository.hasAssociatedCVs.mockResolvedValue(true);

    await expect(
      useCaseUnderTest.execute({ templateId, userRole: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  /**
   * CVT_UT_023
   * Mục tiêu: Xóa thành công → gọi deleteFile cho html + preview và repository.delete.
   */
  it('CVT_UT_023 should delete storage files and repository row', async () => {
    const existing = buildCvTemplateDomain({
      id: templateId,
      htmlUrl: 'https://cdn/t.html',
      previewUrl: 'https://cdn/p.png',
    });
    mockRepository.findById.mockResolvedValue(existing);
    mockRepository.hasAssociatedCVs.mockResolvedValue(false);
    mockRepository.delete.mockResolvedValue(existing);

    const result = await useCaseUnderTest.execute({ templateId, userRole: UserRole.ADMIN });

    expect(mockFileStorage.deleteFile).toHaveBeenCalledWith('https://cdn/t.html');
    expect(mockFileStorage.deleteFile).toHaveBeenCalledWith('https://cdn/p.png');
    expect(mockRepository.delete).toHaveBeenCalledWith(templateId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('thành công');
  });
});
