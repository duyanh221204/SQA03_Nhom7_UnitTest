/**
 * @file SQA03_Nhom7_UT_JobRecruitManagement.test.ts
 * @module F05_QuanLyTinTuyenDung
 * @description Unit tests for F05: Quản lý tin tuyển dụng (Nhà tuyển dụng)
 *              Use cases: CreateJobUseCase, UpdateJobUseCase, CloseJobUseCase, RepostJobUseCase
 * @group Nhom 07 - SQA03
 *
 * Prefix : UT_F05_
 * Tổng   : 41 test cases (41 PASS, 0 FAIL)
 */

// ── Mock mapper trước khi import ─────────────────────────────────────────────
jest.mock('../src/modules/job/application/use-cases/mappers/JobOutputMapper', () => ({
    mapJobToOutput: jest.fn((job: any) => ({
        id: job.id,
        companyId: job.companyId,
        title: job.title,
        description: job.description ?? null,
        location: job.location,
        industry: job.industry,
        jobType: job.jobType ?? job.type ?? null,
        experienceLevel: job.experienceLevel ?? null,
        urgent: job.urgent ?? false,
        status: job.status,
        expiresAt: job.expiresAt ?? null,
        salary: job.salary ?? undefined,
        benefits: job.benefits ?? [],
        requirements: job.requirements ?? [],
    })),
}));

// ── Import use cases từ src/ ──────────────────────────────────────────────────
import { CreateJobUseCase } from '../src/modules/job/application/use-cases/CreateJobUseCase';
import { UpdateJobUseCase } from '../src/modules/job/application/use-cases/UpdateJobUseCase';
import { CloseJobUseCase }  from '../src/modules/job/application/use-cases/CloseJobUseCase';
import { RepostJobUseCase } from '../src/modules/job/application/use-cases/RepostJobUseCase';

// ── Import enums & errors ─────────────────────────────────────────────────────
import { JobStatus }   from '../src/modules/job/domain/enums/JobStatus';
import { UserRole }    from '../src/modules/user/domain/enums/UserRole';
import { UserStatus }  from '../src/modules/user/domain/enums/UserStatus';
import { CompanyRole } from '../src/modules/company/domain/enums/CompanyRole';
import { NotFoundError, AuthorizationError, BusinessRuleError } from '../src/shared/domain/errors/index';

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date('2025-01-01T00:00:00Z');

const buildJob = (overrides: any = {}): any => ({
    id: 'job-001',
    companyId: 'company-001',
    title: 'Software Engineer',
    description: 'Xây dựng ứng dụng',
    location: 'Hà Nội',
    industry: 'IT',
    jobType: 'FULL_TIME',
    experienceLevel: 'JUNIOR',
    urgent: false,
    status: JobStatus.ACTIVE,
    expiresAt: null,
    salary: null,
    benefits: [],
    requirements: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

const buildCompany = (overrides: any = {}): any => ({
    id: 'company-001',
    name: 'Tech Corp',
    status: UserStatus.ACTIVE,
    ...overrides,
});

const buildMember = (overrides: any = {}) => ({
    id: 'member-001',
    userId: 'recruiter-001',
    companyId: 'company-001',
    companyRole: CompanyRole.RECRUITER,
    ...overrides,
});

// ═════════════════════════════════════════════════════════════════════════════
// F05-A: CreateJobUseCase (10 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F05-A – CreateJobUseCase', () => {
    let jobRepo: any;
    let companyRepo: any;
    let memberRepo: any;
    let uc: CreateJobUseCase;

    const baseInput = {
        userId: 'recruiter-001',
        userRole: UserRole.RECRUITER,
        companyId: 'company-001',
        title: 'Backend Developer',
        description: 'Build REST APIs',
    };

    beforeEach(() => {
        jobRepo     = { create: jest.fn().mockResolvedValue(buildJob({ title: 'Backend Developer' })) };
        companyRepo = { findById: jest.fn().mockResolvedValue(buildCompany()) };
        memberRepo  = {
            findByUserId: jest.fn().mockResolvedValue(buildMember()),
            findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember())
        };
        uc = new CreateJobUseCase({
            jobRepository: jobRepo,
            companyRepository: companyRepo,
            companyMemberRepository: memberRepo
        });
    });

    it('UT_F05_01 – RECRUITER thuộc công ty tạo tin tuyển dụng hợp lệ', async () => {
        const result = await uc.execute(baseInput);
        expect(result.title).toBe('Backend Developer');
        expect(jobRepo.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-001', title: 'Backend Developer' }));
    });

    it('UT_F05_02 – ADMIN tạo tin cho bất kỳ công ty nào không cần membership', async () => {
        const result = await uc.execute({ ...baseInput, userRole: UserRole.ADMIN });
        // Admin bỏ qua kiểm tra membership
        expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
        expect(result.title).toBe('Backend Developer');
    });

    it('UT_F05_03 – Tự động lấy companyId từ membership nếu truyền companyId rỗng', async () => {
        const inputWithoutCompany = { ...baseInput, companyId: undefined };
        const result = await uc.execute(inputWithoutCompany);
        expect(result.companyId).toBe('company-001'); // Retrieved from findByUserId
        expect(companyRepo.findById).toHaveBeenCalledWith('company-001');
    });

    it('UT_F05_04 – Thất bại AuthorizationError khi companyId rỗng và không có membership', async () => {
        memberRepo.findByUserId.mockResolvedValue(null);
        await expect(uc.execute({ ...baseInput, companyId: undefined }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_05 – Thất bại NotFoundError khi companyId không tồn tại', async () => {
        companyRepo.findById.mockResolvedValue(null);
        await expect(uc.execute({ ...baseInput, companyId: 'ghost-company' }))
            .rejects.toThrow(NotFoundError);
    });

    it('UT_F05_06 – Thất bại AuthorizationError khi công ty không ở trạng thái ACTIVE', async () => {
        companyRepo.findById.mockResolvedValue(buildCompany({ status: UserStatus.LOCKED }));
        await expect(uc.execute(baseInput))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_07 – Thất bại AuthorizationError khi người dùng (không phải Admin) không thuộc công ty mục tiêu', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(baseInput))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_08 – Thất bại AuthorizationError khi userRole là CANDIDATE nhưng có companyRole=MEMBER (chỉ RECRUITER/MANAGER/OWNER đăng được)', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(baseInput))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_09 – Thành công khi companyRole là OWNER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.OWNER }));
        const res = await uc.execute(baseInput);
        expect(res).toBeDefined();
    });

    it('UT_F05_10 – Submit thành công với data đẩy đủ (salary, benefits, requirements)', async () => {
        await uc.execute({
            ...baseInput,
            salary: { minAmount: 10, maxAmount: 20, currency: 'USD', isNegotiable: false, hideAmount: false },
            benefits: [{ title: 'BHYT', description: 'Bảo hiểm' }],
            requirements: [{ title: '3 năm JS', description: '' }]
        });
        expect(jobRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            salary: expect.any(Object), benefits: expect.any(Array), requirements: expect.any(Array)
        }));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F05-B: UpdateJobUseCase (11 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F05-B – UpdateJobUseCase', () => {
    let jobRepo: any;
    let memberRepo: any;
    let uc: UpdateJobUseCase;

    const baseInput = {
        jobId: 'job-001',
        userId: 'recruiter-001',
        userRole: UserRole.RECRUITER,
        title: 'Updated Title'
    };

    beforeEach(() => {
        jobRepo = {
            findByIdWithRelations: jest.fn().mockResolvedValue(buildJob()),
            update: jest.fn().mockResolvedValue(buildJob({ title: 'Updated Title' })),
            updateWithRelations: jest.fn().mockResolvedValue(buildJob({ title: 'Updated Title' }))
        };
        memberRepo = {
            findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember())
        };
        uc = new UpdateJobUseCase({ jobRepository: jobRepo, companyMemberRepository: memberRepo });
    });

    it('UT_F05_11 – Cập nhật thành công các field nông bằng phương thức update() (không có nested data)', async () => {
        const res = await uc.execute(baseInput);
        expect(res.title).toBe('Updated Title');
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', expect.objectContaining({ title: 'Updated Title' }));
        expect(jobRepo.updateWithRelations).not.toHaveBeenCalled();
    });

    it('UT_F05_12 – Cập nhật thành công field sâu (salary) qua phương thức updateWithRelations()', async () => {
        await uc.execute({ ...baseInput, salary: { minAmount: 100 } as any });
        expect(jobRepo.updateWithRelations).toHaveBeenCalled();
        expect(jobRepo.update).not.toHaveBeenCalled();
    });

    it('UT_F05_13 – Cập nhật thành công field sâu (benefits, requirements) qua phương thức updateWithRelations()', async () => {
        await uc.execute({ ...baseInput, benefits: [{ title: 'Bh', description: '' }] });
        expect(jobRepo.updateWithRelations).toHaveBeenCalled();
    });

    it('UT_F05_14 – Cho phép xóa salary nếu truyền null vào input', async () => {
        await uc.execute({ ...baseInput, salary: null as any });
        expect(jobRepo.updateWithRelations).toHaveBeenCalledWith('job-001', expect.objectContaining({ salary: null }));
    });

    it('UT_F05_15 – Trả về lỗi NotFoundError khi jobId gốc không tồn tại', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(NotFoundError);
    });

    it('UT_F05_16 – ADMIN cập nhật job mà không cần membership logic', async () => {
        await uc.execute({ ...baseInput, userRole: UserRole.ADMIN });
        expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
        expect(jobRepo.update).toHaveBeenCalled();
    });

    it('UT_F05_17 – Thất bại AuthorizationError khi người cập nhật (không phải admin) không phải thành viên công ty', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_18 – Thất bại AuthorizationError khi member có role MEMBER không hỗ trợ cập nhật tin', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_19 – Cập nhật thành công status', async () => {
        await uc.execute({ ...baseInput, status: JobStatus.INACTIVE });
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', expect.objectContaining({ status: JobStatus.INACTIVE }));
    });

    it('UT_F05_20 – Có thể đổi location và industry thành undefined (hoặc rỗng tuỳ logic mapper)', async () => {
        await uc.execute({ ...baseInput, location: 'Da Nang' });
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', expect.objectContaining({ location: 'Da Nang' }));
    });

    it('UT_F05_21 – Chỉ thay đổi các keys được truyền vào updateData, không overwrite keys không truyền', async () => {
        await uc.execute(baseInput); // only title provided
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', { title: 'Updated Title' });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F05-C: CloseJobUseCase (10 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F05-C – CloseJobUseCase', () => {
    let jobRepo: any;
    let memberRepo: any;
    let uc: CloseJobUseCase;

    const baseInput = { jobId: 'job-001', userId: 'user-001', userRole: UserRole.RECRUITER };

    beforeEach(() => {
        jobRepo = {
            findByIdWithRelations: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.ACTIVE })),
            update: jest.fn().mockResolvedValue(buildJob({ status: JobStatus.INACTIVE }))
        };
        memberRepo = { findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()) };
        uc = new CloseJobUseCase({ jobRepository: jobRepo, companyMemberRepository: memberRepo });
    });

    it('UT_F05_22 – Thành công đóng job bới RECRUITER của công ty', async () => {
        const res = await uc.execute(baseInput);
        expect(res.status).toBe(JobStatus.INACTIVE);
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', { status: JobStatus.INACTIVE });
    });

    it('UT_F05_23 – Thành công đóng job bới ADMIN (không check company members)', async () => {
        await uc.execute({ ...baseInput, userRole: UserRole.ADMIN });
        expect(jobRepo.update).toHaveBeenCalledWith('job-001', { status: JobStatus.INACTIVE });
        expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
    });

    it('UT_F05_24 – Lỗi NotFoundError khi job không tồn tại', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(NotFoundError);
    });

    it('UT_F05_25 – Lỗi BusinessRuleError khi job đã có trạng thái INACTIVE từ trước', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.INACTIVE }));
        await expect(uc.execute(baseInput)).rejects.toThrow(BusinessRuleError);
        await expect(uc.execute(baseInput)).rejects.toThrow(/already closed/i);
    });

    it('UT_F05_26 – Lỗi AuthorizationError khi user không thuộc công ty đăng tin đó', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_27 – Lỗi AuthorizationError khi user thuộc công ty nhưng chỉ mang quyền MEMBER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_28 – Thành công khi user mang quyền OWNER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.OWNER }));
        const res = await uc.execute(baseInput);
        expect(res.status).toBe(JobStatus.INACTIVE);
    });

    it('UT_F05_29 – Thành công khi user mang quyền MANAGER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: CompanyRole.MANAGER }));
        const res = await uc.execute(baseInput);
        expect(res.status).toBe(JobStatus.INACTIVE);
    });

    it('UT_F05_30 – Chỉ thay đổi field duy nhất là status trên update()', async () => {
        await uc.execute(baseInput);
        expect(jobRepo.update.mock.calls[0][1]).toStrictEqual({ status: JobStatus.INACTIVE });
    });

    it('UT_F05_31 – Đóng job với trạng thái DRAFT vẫn hoạt động và chuyển sang INACTIVE', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.DRAFT }));
        const res = await uc.execute(baseInput);
        expect(res.status).toBe(JobStatus.INACTIVE);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F05-D: RepostJobUseCase (10 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F05-D – RepostJobUseCase', () => {
    let jobRepo: any;
    let memberRepo: any;
    let uc: RepostJobUseCase;

    const baseInput = { jobId: 'job-old', userId: 'user-001', userRole: UserRole.RECRUITER };

    beforeEach(() => {
        jobRepo = {
            // Original job holds rich data
            findByIdWithRelations: jest.fn().mockResolvedValue(buildJob({
                id: 'job-old',
                title: 'Data Scientist',
                salary: { minAmount: 2000, maxAmount: 3000, currency: 'USD' },
                benefits: [{ title: 'Lunch', description: '' }],
                requirements: [{ title: 'Python', description: '' }]
            })),
            create: jest.fn().mockResolvedValue(buildJob({
                id: 'job-new',
                title: 'Data Scientist',
                status: JobStatus.ACTIVE
            }))
        };
        memberRepo = { findByCompanyAndUser: jest.fn().mockResolvedValue(buildMember()) };
        uc = new RepostJobUseCase({ jobRepository: jobRepo, companyMemberRepository: memberRepo });
    });

    it('UT_F05_32 – Thành công sao chép (repost) lại bộ thông tin của job cũ thành một job id mới bới RECRUITER', async () => {
        const res = await uc.execute(baseInput);
        expect(res.id).toBe('job-new'); // returned new id
        expect(jobRepo.create).toHaveBeenCalled();
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.title).toBe('Data Scientist');   // inherited from original
        expect(createArgs.status).toBe(JobStatus.ACTIVE);  // always active
        expect(createArgs.benefits).toHaveLength(1);       // inherited deeply
        expect(createArgs.salary).toMatchObject({ minAmount: 2000, maxAmount: 3000 });
    });

    it('UT_F05_33 – Tự động cộng 30 ngày cho expiresAt mặc định nếu input không pass expiresAt', async () => {
        const beforeObjDate = new Date();
        await uc.execute(baseInput);
        const createArgs = jobRepo.create.mock.calls[0][0];

        // Assert expires at is ~30 days from now
        const expiresAt = createArgs.expiresAt as Date;
        const diffDays = Math.round((expiresAt.getTime() - beforeObjDate.getTime()) / (1000 * 3600 * 24));
        expect(diffDays).toBe(30);
    });

    it('UT_F05_34 – Sử dụng tham số input (vd: title mới) ghi đè lên thông tin gốc khi repost', async () => {
        await uc.execute({ ...baseInput, title: 'AI Engineer' });
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.title).toBe('AI Engineer'); // overridden
        expect(createArgs.salary).toMatchObject({ minAmount: 2000 }); // unchanged
    });

    it('UT_F05_35 – Lỗi NotFoundError khi job gốc (job-old) không tồn tại', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(NotFoundError);
    });

    it('UT_F05_36 – Thành công cho ADMIN repost bất kỳ tin nào bỏ qua member check', async () => {
        await uc.execute({ ...baseInput, userRole: UserRole.ADMIN });
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.title).toBe('Data Scientist');
        expect(memberRepo.findByCompanyAndUser).not.toHaveBeenCalled();
    });

    it('UT_F05_37 – Lỗi AuthorizationError khi user KHÔNG thuộc công ty của tin bài gốc', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_38 – Lỗi AuthorizationError khi user thuộc công ty nhưng chỉ có quyền MEMBER', async () => {
        memberRepo.findByCompanyAndUser.mockResolvedValue(buildMember({ companyRole: ('MEMBER' as any) }));
        await expect(uc.execute(baseInput)).rejects.toThrow(AuthorizationError);
    });

    it('UT_F05_39 – Repost tin cũ có trường benefits và requirements rỗng (undefined)', async () => {
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({
            id: 'job-old',
            benefits: undefined,
            requirements: undefined
        }));
        await uc.execute(baseInput);
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.benefits).toBeUndefined();
        expect(createArgs.requirements).toBeUndefined();
    });

    it('UT_F05_40 – Ghi đè salary bằng array override rỗng (huỷ hiển thị lương) khi repost thông qua input.salary', async () => {
        await uc.execute({
            ...baseInput,
            salary: { minAmount: 500, maxAmount: 1000, currency: 'USD', hideAmount: true, isNegotiable: false }
        });
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.salary.minAmount).toBe(500);
    });

    it('UT_F05_41 – Không override nếu properties truyền vào input là undefined (ngoại trừ giá trị falsy khác)', async () => {
        const res = await uc.execute({ ...baseInput, title: undefined });
        const createArgs = jobRepo.create.mock.calls[0][0];
        expect(createArgs.title).toBe('Data Scientist'); // retained from original!
    });
});