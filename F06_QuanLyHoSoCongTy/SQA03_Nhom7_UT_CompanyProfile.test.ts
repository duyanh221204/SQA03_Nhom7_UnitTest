/**
 * @file SQA03_Nhom7_UT_CompanyProfile.test.ts
 * @module F06_QuanLyHoSoCongTy
 * @description Unit tests for Quản lý hồ sơ công ty (Nhà tuyển dụng)
 *              Use cases: RegisterCompany, UpdateCompany, UploadLogo, UploadBanner
 * @group Nhom 07 - SQA03
 *
 * Tiền tố : UT_F06_
 * Tổng cộng: 31 test cases (Tất cả 31 đều PASS)
 */

import { RegisterCompanyUseCase } from '../src/modules/company/application/use-cases/RegisterCompanyUseCase';
import { UpdateCompanyUseCase } from '../src/modules/company/application/use-cases/UpdateCompanyUseCase';
import { UploadLogoUseCase } from '../src/modules/company/application/use-cases/UploadLogoUseCase';
import { UploadBannerUseCase } from '../src/modules/company/application/use-cases/UploadBannerUseCase';

import { CompanyRole } from '../src/modules/company/domain/enums/CompanyRole';
import { UserRole } from '../src/modules/user/domain/enums/UserRole';
import { UserStatus } from '../src/modules/user/domain/enums/UserStatus';
import { NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../src/shared/domain/errors/index';

// ── Helpers ───────────────────────────────────────────────────────────────────
const buildCompany = (overrides: any = {}) => ({
    id: 'company-001',
    name: 'Tech Corp',
    status: UserStatus.ACTIVE,
    logoUrl: 'http://example.com/logo.png',
    bannerUrl: 'http://example.com/banner.png',
    members: [],
    ...overrides,
});

const buildUser = (overrides: any = {}) => ({
    id: 'user-001',
    email: 'test@example.com',
    role: UserRole.CANDIDATE,
    status: UserStatus.ACTIVE,
    ...overrides,
});

const buildMember = (overrides: any = {}) => ({
    id: 'member-001',
    userId: 'user-001',
    companyId: 'company-001',
    companyRole: CompanyRole.OWNER,
    ...overrides,
});

const mockFile = { buffer: Buffer.from('mock'), originalname: 'test.png', mimetype: 'image/png' };
const mockDocFile = { buffer: Buffer.from('doc'), originalname: 'doc.pdf', mimetype: 'application/pdf' };

// ═════════════════════════════════════════════════════════════════════════════
// F06-A: RegisterCompanyUseCase (11 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F06-A – RegisterCompanyUseCase', () => {
    let uc: RegisterCompanyUseCase;
    let companyRepo: any;
    let memberRepo: any;
    let userRepo: any;
    let storageSvc: any;
    let notifySvc: any;

    beforeEach(() => {
        companyRepo = {
            nameExists: jest.fn().mockResolvedValue(false),
            save: jest.fn().mockResolvedValue(buildCompany({ status: UserStatus.PENDING })),
            findById: jest.fn().mockResolvedValue(null),
            findByIdWithMembers: jest.fn().mockResolvedValue(buildCompany({ status: UserStatus.PENDING }))
        };
        memberRepo = {
            findByUserId: jest.fn().mockResolvedValue(null),
            delete: jest.fn().mockResolvedValue(true),
            save: jest.fn().mockResolvedValue(buildMember())
        };
        userRepo = {
            findById: jest.fn().mockResolvedValue(buildUser()),
            findAll: jest.fn().mockResolvedValue({ data: [buildUser({ id: 'admin-1', role: UserRole.ADMIN })] })
        };
        storageSvc = {
            uploadDocument: jest.fn().mockResolvedValue('http://example.com/doc.pdf'),
            uploadImage: jest.fn().mockResolvedValue('http://example.com/logo.png'),
        };
        notifySvc = {
            createNotification: jest.fn().mockResolvedValue(true)
        };
        uc = new RegisterCompanyUseCase({
            companyRepository: companyRepo, companyMemberRepository: memberRepo,
            userRepository: userRepo, storageService: storageSvc, notificationService: notifySvc
        });
    });

    const validInp = { ownerId: 'user-001', userId: 'user-001', name: 'Z company', documentFile: mockDocFile };

    it('UT_F06_01 – Thành công đăng ký công ty mới cho CANDIDATE kèm thông báo cho ADMIN', async () => {
        const res = await uc.execute(validInp);
        expect(res.name).toBe('Tech Corp');
        expect(companyRepo.save).toHaveBeenCalled();
        expect(memberRepo.save).toHaveBeenCalledWith(expect.objectContaining({ companyRole: CompanyRole.OWNER }));
        expect(notifySvc.createNotification).toHaveBeenCalled();
    });

    it('UT_F06_02 – Fallback sử dụng ownerId khi truyền ownerId thay vì userId', async () => {
        await uc.execute({ ownerId: 'user-002', name: 'ZZ', documentFile: mockDocFile });
        expect(userRepo.findById).toHaveBeenCalledWith('user-002');
    });

    it('UT_F06_03 – Lỗi ValidationError khi người dùng (ownerId) không tồn tại trong DB', async () => {
        userRepo.findById.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(ValidationError);
    });

    it('UT_F06_04 – Lỗi ConflictError do tài khoản đã là RECRUITER', async () => {
        userRepo.findById.mockResolvedValue(buildUser({ role: UserRole.RECRUITER }));
        await expect(uc.execute(validInp)).rejects.toThrow(ConflictError);
        await expect(uc.execute(validInp)).rejects.toThrow(/mỗi người dùng chỉ có thể quản lý một công ty/i);
    });

    it('UT_F06_05 – Lỗi ConflictError do người dùng là ADMIN (phân quyền hệ thống không thể làm owner)', async () => {
        userRepo.findById.mockResolvedValue(buildUser({ role: UserRole.ADMIN }));
        await expect(uc.execute(validInp)).rejects.toThrow(ConflictError);
    });

    it('UT_F06_06 – Cho phép đăng ký lại nếu đơn cũ đã bị từ chối/bị xoá (status != PENDING)', async () => {
        memberRepo.findByUserId.mockResolvedValue(buildMember());
        companyRepo.findById.mockResolvedValue(buildCompany({ status: UserStatus.LOCKED })); // aka Rejected
        await uc.execute(validInp);
        // Do có member cũ bị từ chối nên memberRepo.delete() được gọi để dọn dẹp data cũ
        expect(memberRepo.delete).toHaveBeenCalled();
        expect(companyRepo.save).toHaveBeenCalled();
    });

    it('UT_F06_07 – Thất bại do đang có một đơn chờ xét duyệt (PENDING)', async () => {
        memberRepo.findByUserId.mockResolvedValue(buildMember());
        companyRepo.findById.mockResolvedValue(buildCompany({ status: UserStatus.PENDING }));
        await expect(uc.execute(validInp)).rejects.toThrow(ConflictError);
    });

    it('UT_F06_08 – Thất bại ConflictError vì trùng tên công ty', async () => {
        companyRepo.nameExists.mockResolvedValue(true);
        await expect(uc.execute(validInp)).rejects.toThrow(ConflictError);
    });

    it('UT_F06_09 – Thất bại tải tài liệu (thiếu documentFile)', async () => {
        await expect(uc.execute({ ownerId: 'user-001', userId: 'user-001', name: 'Z', documentFile: undefined as any })).rejects.toThrow(ValidationError);
    });

    it('UT_F06_10 – Upload document lên storage thành công khi tạo công ty', async () => {
        await uc.execute(validInp);
        expect(storageSvc.uploadDocument).toHaveBeenCalledWith(mockDocFile.buffer, mockDocFile.originalname, mockDocFile.mimetype);
    });

    it('UT_F06_11 – Upload logo lên storage tự động nếu có tệp đính kèm logo', async () => {
        await uc.execute({ ...validInp, logoFile: mockFile });
        expect(storageSvc.uploadImage).toHaveBeenCalledWith(mockFile.buffer, mockFile.originalname, mockFile.mimetype, 'company-logos');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F06-B: UpdateCompanyUseCase (8 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F06-B – UpdateCompanyUseCase', () => {
    let uc: UpdateCompanyUseCase;
    let companyRepo: any;
    let memberRepo: any;
    let storageSvc: any;

    beforeEach(() => {
        companyRepo = {
            findByIdWithMembers: jest.fn().mockResolvedValue(buildCompany()),
            update: jest.fn().mockResolvedValue(buildCompany()),
            nameExists: jest.fn().mockResolvedValue(false)
        };
        memberRepo = { findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()) };
        storageSvc = {
            uploadImage: jest.fn().mockResolvedValue('http://new.com/img.png'),
            deleteFile: jest.fn().mockResolvedValue(true)
        };
        uc = new UpdateCompanyUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo, storageService: storageSvc });
    });

    const validInp = { companyId: 'company-001', userId: 'user-001', description: 'Hello' };

    it('UT_F06_12 – OWNER update thông tin thường thành công', async () => {
        const res = await uc.execute(validInp);
        expect(res.id).toBe('company-001');
        expect(companyRepo.update).toHaveBeenCalledWith('company-001', expect.objectContaining({ description: 'Hello' }));
    });

    it('UT_F06_13 – MANAGER có quyền cập nhật thông tin công ty', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.MANAGER }));
        await expect(uc.execute(validInp)).resolves.toBeDefined();
    });


    it('UT_F06_14 – Lỗi AuthorizationError khi RECRUITER cố gắng update', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.RECRUITER }));
        await expect(uc.execute(validInp)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F06_15 – Lỗi AuthorizationError do user không có quyền thành viên (thành viên không hợp lệ)', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(AuthorizationError);
    });


    it('UT_F06_16 – Thất bại ConflictError vì tên công ty mới đã bị sử dụng', async () => {
        companyRepo.nameExists.mockResolvedValue(true);
        await expect(uc.execute({ ...validInp, name: 'Brand New' })).rejects.toThrow(ConflictError);
    });

    it('UT_F06_17 – Update logo kèm upload hình mới và dọn dẹp file cũ thành công', async () => {
        await uc.execute({ ...validInp, logoFile: mockFile });
        expect(storageSvc.uploadImage).toHaveBeenCalledWith(mockFile.buffer, expect.any(String), expect.any(String), 'company-logos');
        expect(companyRepo.update).toHaveBeenCalledWith('company-001', expect.objectContaining({ logoUrl: 'http://new.com/img.png' }));
        expect(storageSvc.deleteFile).toHaveBeenCalledWith('http://example.com/logo.png'); // old file
    });

    it('UT_F06_18 – Update banner kèm upload banner mới và dọn dẹp hình cũ thành công', async () => {
        await uc.execute({ ...validInp, bannerFile: mockFile });
        expect(storageSvc.uploadImage).toHaveBeenCalledWith(mockFile.buffer, expect.any(String), expect.any(String), 'company-banners');
        expect(companyRepo.update).toHaveBeenCalledWith('company-001', expect.objectContaining({ bannerUrl: 'http://new.com/img.png' }));
        expect(storageSvc.deleteFile).toHaveBeenCalledWith('http://example.com/banner.png');
    });

    it('UT_F06_19 – Lỗi NotFoundError do companyId không tồn tại', async () => {
        companyRepo.findByIdWithMembers.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(NotFoundError);
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// F06-C: UploadLogoUseCase (6 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F06-C – UploadLogoUseCase', () => {
    let uc: UploadLogoUseCase;
    let companyRepo: any;
    let memberRepo: any;
    let storageSvc: any;

    beforeEach(() => {
        companyRepo = {
            findByIdWithoutMembers: jest.fn().mockResolvedValue(buildCompany({ logoUrl: 'old_logo.png' })),
            update: jest.fn().mockResolvedValue(true)
        };
        memberRepo = { findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()) };
        storageSvc = {
            uploadImage: jest.fn().mockResolvedValue('new_logo.png'),
            deleteFile: jest.fn().mockResolvedValue(true)
        };
        uc = new UploadLogoUseCase(companyRepo, memberRepo, storageSvc);
    });

    const validInp = { companyId: 'c1', userId: 'u1', file: mockFile };

    it('UT_F06_20 – Upload Logo thành công trên tài khoản OWNER, gán logo mới vào DB', async () => {
        const res = await uc.execute(validInp);
        expect(res.logoUrl).toBe('new_logo.png');
        expect(companyRepo.update).toHaveBeenCalledWith('c1', { logoUrl: 'new_logo.png' });
    });

    it('UT_F06_21 – Upload Logo thành công trên tài khoản MANAGER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.MANAGER }));
        await expect(uc.execute(validInp)).resolves.toHaveProperty('logoUrl');
    });

    it('UT_F06_22 – Upload Logo thành công trên tài khoản RECRUITER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.RECRUITER }));
        await expect(uc.execute(validInp)).resolves.toHaveProperty('logoUrl');
    });


    it('UT_F06_23 – Thất bại AuthorizationError do Role không được cấp quyền (MEMBER)', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(validInp)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F06_24 – Thất bại NotFoundError khi cung cấp companyId null/không hợp lệ', async () => {
        companyRepo.findByIdWithoutMembers.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(NotFoundError);
    });


    it('UT_F06_25 – Không ngắt tiến trình báo lỗi nền nếu Storage S3 thất bại', async () => {
        storageSvc.deleteFile.mockRejectedValue(new Error('Background Error!'));
        await expect(uc.execute(validInp)).resolves.toBeDefined();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F06-D: UploadBannerUseCase (6 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F06-D – UploadBannerUseCase', () => {
    let uc: UploadBannerUseCase;
    let companyRepo: any;
    let memberRepo: any;
    let storageSvc: any;

    beforeEach(() => {
        companyRepo = {
            findByIdWithoutMembers: jest.fn().mockResolvedValue(buildCompany({ bannerUrl: 'old_banner.png' })),
            update: jest.fn().mockResolvedValue(true)
        };
        memberRepo = { findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()) };
        storageSvc = {
            uploadImage: jest.fn().mockResolvedValue('new_banner.png'),
            deleteFile: jest.fn().mockResolvedValue(true)
        };
        uc = new UploadBannerUseCase(companyRepo, memberRepo, storageSvc);
    });

    const validInp = { companyId: 'c1', userId: 'u1', file: mockFile };

    it('UT_F06_26 – Đăng tải Banner thành công bởi OWNER và gán URL vào company record', async () => {
        const res = await uc.execute(validInp);
        expect(res.bannerUrl).toBe('new_banner.png');
        expect(companyRepo.update).toHaveBeenCalledWith('c1', { bannerUrl: 'new_banner.png' });
    });

    it('UT_F06_27 – Đăng tải Banner thành công bởi RECRUITER do có quyền hạn liên quan', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.RECRUITER }));
        const res = await uc.execute(validInp);
        expect(res.bannerUrl).toBeDefined();
    });

    it('UT_F06_28 – Đăng tải Banner thành công bởi MANAGER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.MANAGER }));
        await expect(uc.execute(validInp)).resolves.toBeDefined();
    });


    it('UT_F06_29 – Thất bại khi thành viên thường (MEMBER) thao tác cập nhật Banner', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(validInp)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F06_30 – Yêu cầu từ tài khoản không nằm trong công ty dẫn tới lỗi Authorization', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F06_31 – Không tìm thấy hồ sơ doanh nghiệp (NotFoundError) cho ID rác/không tồn tại', async () => {
        companyRepo.findByIdWithoutMembers.mockResolvedValue(null);
        await expect(uc.execute(validInp)).rejects.toThrow(NotFoundError);
    });

});