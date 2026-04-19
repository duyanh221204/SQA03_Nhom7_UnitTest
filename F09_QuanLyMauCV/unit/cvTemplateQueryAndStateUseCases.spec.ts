/**
 * Unit tests: ActivateTemplateUseCase, DeactivateTemplateUseCase,
 *             GetTemplateByIdUseCase, GetAllTemplatesUseCase, GetActiveTemplatesUseCase
 * Module: Quản lý mẫu CV / Public active templates
 */

import { ActivateTemplateUseCase } from '../../../src/modules/cv/application/use-cases/ActivateTemplateUseCase';
import { DeactivateTemplateUseCase } from '../../../src/modules/cv/application/use-cases/DeactivateTemplateUseCase';
import { GetTemplateByIdUseCase } from '../../../src/modules/cv/application/use-cases/GetTemplateByIdUseCase';
import { GetAllTemplatesUseCase } from '../../../src/modules/cv/application/use-cases/GetAllTemplatesUseCase';
import { GetActiveTemplatesUseCase } from '../../../src/modules/cv/application/use-cases/GetActiveTemplatesUseCase';
import type { ICVTemplateRepository } from '../../../src/modules/cv/domain/repositories/ICVTemplateRepository';
import { UserRole } from '../../../src/modules/user/domain/enums/UserRole';
import { AuthorizationError, NotFoundError } from '../../../src/shared/domain/errors/index';
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

describe('ActivateTemplateUseCase', () => {
  /**
   * CVT_UT_030
   * Mục tiêu: Kích hoạt thành công khi admin và mẫu tồn tại.
   */
  it('CVT_UT_030 should set isActive true for admin', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const templateId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const existing = buildCvTemplateDomain({ id: templateId, isActive: false });
    mockRepository.findById.mockResolvedValue(existing);
    mockRepository.update.mockResolvedValue(existing.with({ isActive: true }));

    const useCase = new ActivateTemplateUseCase({ cvTemplateRepository: mockRepository });
    const out = await useCase.execute({ templateId, userRole: UserRole.ADMIN });

    expect(mockRepository.update).toHaveBeenCalledWith(templateId, { isActive: true });
    expect(out.isActive).toBe(true);
  });

  /**
   * CVT_UT_031
   * Mục tiêu: Non-admin không được kích hoạt.
   */
  it('CVT_UT_031 should reject activate for non-admin', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const useCase = new ActivateTemplateUseCase({ cvTemplateRepository: mockRepository });

    await expect(
      useCase.execute({ templateId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', userRole: UserRole.RECRUITER }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('DeactivateTemplateUseCase', () => {
  /**
   * CVT_UT_032
   * Mục tiêu: Vô hiệu hóa thành công.
   */
  it('CVT_UT_032 should set isActive false for admin', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const templateId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const existing = buildCvTemplateDomain({ id: templateId, isActive: true });
    mockRepository.findById.mockResolvedValue(existing);
    mockRepository.update.mockResolvedValue(existing.with({ isActive: false }));

    const useCase = new DeactivateTemplateUseCase({ cvTemplateRepository: mockRepository });
    const out = await useCase.execute({ templateId, userRole: UserRole.ADMIN });

    expect(out.isActive).toBe(false);
  });
});

describe('GetTemplateByIdUseCase', () => {
  /**
   * CVT_UT_040
   * Mục tiêu: Admin xem được mẫu inactive.
   */
  it('CVT_UT_040 should allow admin to read inactive template', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const templateId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const inactive = buildCvTemplateDomain({ id: templateId, isActive: false });
    mockRepository.findById.mockResolvedValue(inactive);

    const useCase = new GetTemplateByIdUseCase({ cvTemplateRepository: mockRepository });
    const out = await useCase.execute({ templateId, userRole: UserRole.ADMIN });

    expect(out.isActive).toBe(false);
  });

  /**
   * CVT_UT_041
   * Mục tiêu: Ứng viên không xem được mẫu inactive.
   */
  it('CVT_UT_041 should reject candidate viewing inactive template', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const templateId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    mockRepository.findById.mockResolvedValue(buildCvTemplateDomain({ id: templateId, isActive: false }));

    const useCase = new GetTemplateByIdUseCase({ cvTemplateRepository: mockRepository });

    await expect(
      useCase.execute({ templateId, userRole: UserRole.CANDIDATE }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  /**
   * CVT_UT_042
   * Mục tiêu: Không tìm thấy mẫu → NotFoundError.
   */
  it('CVT_UT_042 should throw NotFound when template missing', async () => {
    const mockRepository = createMockCvTemplateRepository();
    mockRepository.findById.mockResolvedValue(null);
    const useCase = new GetTemplateByIdUseCase({ cvTemplateRepository: mockRepository });

    await expect(
      useCase.execute({ templateId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', userRole: UserRole.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GetAllTemplatesUseCase', () => {
  /**
   * CVT_UT_050
   * Mục tiêu: Admin có thể lọc theo isActive=false.
   */
  it('CVT_UT_050 should pass isActive filter for admin', async () => {
    const mockRepository = createMockCvTemplateRepository();
    mockRepository.findAll.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const useCase = new GetAllTemplatesUseCase({ cvTemplateRepository: mockRepository });
    await useCase.execute({ userRole: UserRole.ADMIN, page: 1, limit: 10, isActive: false });

    expect(mockRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  /**
   * CVT_UT_051
   * Mục tiêu: Non-admin luôn bị ép chỉ xem mẫu active (isActive=true).
   */
  it('CVT_UT_051 should force isActive true for non-admin regardless of query intent', async () => {
    const mockRepository = createMockCvTemplateRepository();
    mockRepository.findAll.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    const useCase = new GetAllTemplatesUseCase({ cvTemplateRepository: mockRepository });
    await useCase.execute({ userRole: UserRole.CANDIDATE, page: 1, limit: 10, isActive: false });

    expect(mockRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });
});

describe('GetActiveTemplatesUseCase', () => {
  /**
   * CVT_UT_060
   * Mục tiêu: Public listing chỉ gọi findActive với phân trang.
   */
  it('CVT_UT_060 should delegate to findActive with pagination', async () => {
    const mockRepository = createMockCvTemplateRepository();
    const activeRow = buildCvTemplateDomain({ isActive: true });
    mockRepository.findActive.mockResolvedValue({
      data: [activeRow],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });

    const useCase = new GetActiveTemplatesUseCase({ cvTemplateRepository: mockRepository });
    const out = await useCase.execute({ page: 2, limit: 5 });

    expect(mockRepository.findActive).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 }),
    );
    expect(out.data).toHaveLength(1);
    expect(out.data[0].isActive).toBe(true);
  });
});
