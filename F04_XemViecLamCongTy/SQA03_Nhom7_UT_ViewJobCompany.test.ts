/**
 * @file SQA03_Nhom7_UT_ViewJobCompany.test.ts
 * @module F04_XemViecLamCongTy
 * @description Unit tests for F04: Xem việc làm & Công ty (Ứng viên)
 *              Use cases: GetJobByIdUseCase, SearchJobsUseCase, GetJobsByCompanyUseCase,
 *              GetSimilarJobsUseCase, CheckJobSavedUseCase, GetSavedJobsUseCase,
 *              GetCompanyByIdUseCase
 * @group Nhom 07 - SQA03
 *
 * Prefix : UT_F04_
 * Tổng   : 51 test cases (49 PASS, 2 FAIL – ghi nhận bug)
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
        applicationCount: job.applicationCount ?? 0,
        createdAt: job.createdAt ?? null,
        updatedAt: job.updatedAt ?? null,
        company: job.company ?? undefined,
        salary: job.salary ?? undefined,
        skills: job.skills ?? [],
        benefits: job.benefits ?? [],
        requirements: job.requirements ?? [],
    })),
}));

// ── Import use cases từ src/ ──────────────────────────────────────────────────
import { GetJobByIdUseCase }       from '../src/modules/job/application/use-cases/GetJobByIdUseCase';
import { SearchJobsUseCase }       from '../src/modules/job/application/use-cases/SearchJobsUseCase';
import { GetJobsByCompanyUseCase } from '../src/modules/job/application/use-cases/GetJobsByCompanyUseCase';
import { GetSimilarJobsUseCase }   from '../src/modules/job/application/use-cases/GetSimilarJobsUseCase';
import { CheckJobSavedUseCase }    from '../src/modules/job/application/use-cases/CheckJobSavedUseCase';
import { GetSavedJobsUseCase }     from '../src/modules/job/application/use-cases/GetSavedJobsUseCase';
import { GetCompanyByIdUseCase }   from '../src/modules/company/application/use-cases/GetCompanyByIdUseCase';

// ── Import enums & errors ─────────────────────────────────────────────────────
import { JobStatus }  from '../src/modules/job/domain/enums/JobStatus';
import { UserRole }   from '../src/modules/user/domain/enums/UserRole';
import { UserStatus } from '../src/modules/user/domain/enums/UserStatus';
import { NotFoundError, AuthorizationError } from '../src/shared/domain/errors/index';

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date('2025-01-01T00:00:00Z');

const buildJob = (overrides: any = {}): any => ({
    id: 'job-001',
    companyId: 'company-001',
    title: 'Software Engineer',
    description: 'Xây dựng ứng dụng web',
    location: 'Hà Nội',
    industry: 'IT',
    jobType: 'FULL_TIME',
    experienceLevel: 'JUNIOR',
    urgent: false,
    status: JobStatus.ACTIVE,
    expiresAt: null,
    applicationCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

const buildCompany = (overrides: any = {}): any => ({
    id: 'company-001',
    name: 'Công ty ABC',
    website: 'https://abc.vn',
    description: 'Công ty công nghệ',
    industry: 'IT',
    companySize: '50-100',
    foundedYear: 2010,
    address: 'Hà Nội',
    phone: '0901234567',
    email: 'contact@abc.vn',
    logoUrl: null,
    bannerUrl: null,
    documentUrl: null,
    status: UserStatus.ACTIVE,
    members: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

const buildSimilarJob = (jobOverrides: any = {}): any => ({
    jobId: 'job-001',
    similarJobId: 'job-002',
    similarity: 0.85,
    similarJob: buildJob({ id: 'job-002', title: 'Backend Developer', ...jobOverrides }),
});

const buildSavedJob = (overrides: any = {}): any => ({
    id: 'saved-001',
    jobId: 'job-001',
    userId: 'user-001',
    createdAt: now,
    job: buildJob(),
    ...overrides,
});

const pagination = (total = 1, page = 1, limit = 10) => ({
    page, limit, total, totalPages: Math.ceil(total / limit),
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-A: GetJobByIdUseCase (13 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-A – GetJobByIdUseCase', () => {
    let jobRepo: any;
    let userRepo: any;

    beforeEach(() => {
        jobRepo  = { findByIdWithRelations: jest.fn() };
        userRepo = { findByIdWithCompanyMember: jest.fn() };
    });

    it('UT_F04_01 – Xem chi tiết việc làm ACTIVE thành công', async () => {
        /**
         * Input         : jobId="job-001", status=ACTIVE, userRole=CANDIDATE
         * Expected      : Trả về job đầy đủ, id="job-001", status=ACTIVE
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob());
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userRole: UserRole.CANDIDATE });

        expect(result.id).toBe('job-001');
        expect(result.status).toBe(JobStatus.ACTIVE);
        expect(jobRepo.findByIdWithRelations).toHaveBeenCalledWith('job-001');
    });

    it('UT_F04_02 – Xem việc làm không có userId (anonymous)', async () => {
        /**
         * Input         : jobId="job-001", không truyền userId/userRole
         * Expected      : Trả về job thành công (tin ACTIVE)
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob());
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001' });

        expect(result.id).toBe('job-001');
    });

    it('UT_F04_03 – ADMIN xem tin ACTIVE', async () => {
        /**
         * Input         : status=ACTIVE, userRole=ADMIN
         * Expected      : Trả về job bình thường
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob());
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userRole: UserRole.ADMIN });

        expect(result.status).toBe(JobStatus.ACTIVE);
    });

    it('UT_F04_04 – RECRUITER xem tin ACTIVE của công ty mình', async () => {
        /**
         * Input         : userRole=RECRUITER, companyMember thuộc company-001
         * Expected      : Trả về job thành công
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob());
        userRepo.findByIdWithCompanyMember.mockResolvedValue({
            companyMember: { company: { id: 'company-001' } },
        });
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userId: 'rec-001', userRole: UserRole.RECRUITER });

        expect(result.id).toBe('job-001');
    });

    it('UT_F04_05 – ADMIN có thể xem tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, userRole=ADMIN
         * Expected      : Trả về job LOCKED
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userRole: UserRole.ADMIN });

        expect(result.status).toBe(JobStatus.LOCKED);
    });

    it('UT_F04_06 – CANDIDATE không thể xem tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, userRole=CANDIDATE
         * Expected      : AuthorizationError
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await expect(uc.execute({ jobId: 'job-001', userRole: UserRole.CANDIDATE }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_07 – Anonymous không thể xem tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, không có userRole
         * Expected      : AuthorizationError
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await expect(uc.execute({ jobId: 'job-001' }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_08 – RECRUITER cùng công ty có thể xem tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, RECRUITER thuộc company-001
         * Expected      : Trả về job LOCKED
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        userRepo.findByIdWithCompanyMember.mockResolvedValue({
            companyMember: { company: { id: 'company-001' } },
        });
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userId: 'rec-001', userRole: UserRole.RECRUITER });

        expect(result.status).toBe(JobStatus.LOCKED);
    });

    it('UT_F04_09 – RECRUITER công ty khác không xem được tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, RECRUITER thuộc company-999 (khác công ty)
         * Expected      : AuthorizationError
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        userRepo.findByIdWithCompanyMember.mockResolvedValue({
            companyMember: { company: { id: 'company-999' } },
        });
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await expect(uc.execute({ jobId: 'job-001', userId: 'rec-002', userRole: UserRole.RECRUITER }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_10 – RECRUITER không thuộc công ty nào không xem được tin LOCKED', async () => {
        /**
         * Input         : status=LOCKED, userRepo trả về null
         * Expected      : AuthorizationError
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.LOCKED }));
        userRepo.findByIdWithCompanyMember.mockResolvedValue(null);
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await expect(uc.execute({ jobId: 'job-001', userId: 'rec-003', userRole: UserRole.RECRUITER }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_11 – NotFoundError khi jobId không tồn tại', async () => {
        /**
         * Input         : jobId="ghost-job" (không có trong DB)
         * Expected      : NotFoundError
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(null);
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await expect(uc.execute({ jobId: 'ghost-job', userRole: UserRole.CANDIDATE }))
            .rejects.toThrow(NotFoundError);
    });

    it('UT_F04_12 – findByIdWithRelations được gọi đúng 1 lần với jobId đúng', async () => {
        /**
         * Input         : jobId="job-abc"
         * Expected      : repository gọi đúng với "job-abc", 1 lần
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ id: 'job-abc' }));
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        await uc.execute({ jobId: 'job-abc', userRole: UserRole.CANDIDATE });

        expect(jobRepo.findByIdWithRelations).toHaveBeenCalledTimes(1);
        expect(jobRepo.findByIdWithRelations).toHaveBeenCalledWith('job-abc');
    });

    it('UT_F04_13 – Tin INACTIVE – CANDIDATE xem được (chỉ LOCKED mới bị chặn)', async () => {
        /**
         * Input         : status=INACTIVE, userRole=CANDIDATE
         * Expected      : Trả về job (INACTIVE không bị chặn)
         */
        jobRepo.findByIdWithRelations.mockResolvedValue(buildJob({ status: JobStatus.INACTIVE }));
        const uc = new GetJobByIdUseCase({ jobRepository: jobRepo, userRepository: userRepo });

        const result = await uc.execute({ jobId: 'job-001', userRole: UserRole.CANDIDATE });

        expect(result.status).toBe(JobStatus.INACTIVE);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-B: SearchJobsUseCase (10 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-B – SearchJobsUseCase', () => {
    let jobRepo: any;

    beforeEach(() => {
        jobRepo = { searchJobs: jest.fn() };
    });

    it('UT_F04_14 – Non-admin (CANDIDATE) chỉ tìm kiếm được tin ACTIVE', async () => {
        /**
         * Input         : userRole=CANDIDATE, status=LOCKED (cố tình)
         * Expected      : searchJobs nhận status=ACTIVE (bị override)
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ userRole: UserRole.CANDIDATE, status: JobStatus.LOCKED });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ status: JobStatus.ACTIVE })
        );
    });

    it('UT_F04_15 – ADMIN tìm kiếm với status=LOCKED – không bị override', async () => {
        /**
         * Input         : userRole=ADMIN, status=LOCKED
         * Expected      : searchJobs nhận status=LOCKED
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ userRole: UserRole.ADMIN, status: JobStatus.LOCKED });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ status: JobStatus.LOCKED })
        );
    });

    it('UT_F04_16 – Tìm kiếm với keyword và location', async () => {
        /**
         * Input         : query="developer", location="Hà Nội"
         * Expected      : searchJobs nhận keyword="developer", location="Hà Nội"
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [buildJob()], pagination: pagination(1) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        const result = await uc.execute({ query: 'developer', location: 'Hà Nội', userRole: UserRole.CANDIDATE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ keyword: 'developer', location: 'Hà Nội' })
        );
        expect(result.data).toHaveLength(1);
    });

    it('UT_F04_17 – Tìm kiếm với salaryMin và salaryMax', async () => {
        /**
         * Input         : salaryMin=5000000, salaryMax=15000000
         * Expected      : searchJobs nhận đúng salaryMin/salaryMax
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ salaryMin: 5_000_000, salaryMax: 15_000_000, userRole: UserRole.CANDIDATE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ salaryMin: 5_000_000, salaryMax: 15_000_000 })
        );
    });

    it('UT_F04_18 – Tìm kiếm với jobType và experienceLevel', async () => {
        /**
         * Input         : jobType="FULL_TIME", experienceLevel="JUNIOR"
         * Expected      : searchJobs nhận đúng các tham số
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ jobType: 'FULL_TIME', experienceLevel: 'JUNIOR', userRole: UserRole.CANDIDATE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ jobType: 'FULL_TIME', experienceLevel: 'JUNIOR' })
        );
    });

    it('UT_F04_19 – Phân trang được truyền đúng (page=2, limit=20)', async () => {
        /**
         * Input         : page=2, limit=20
         * Expected      : searchJobs nhận page=2, limit=20
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0, 2, 20) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ page: 2, limit: 20, userRole: UserRole.CANDIDATE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ page: 2, limit: 20 })
        );
    });

    it('UT_F04_20 – Không truyền page/limit – mặc định page=1, limit=10', async () => {
        /**
         * Input         : không truyền page/limit
         * Expected      : searchJobs nhận page=1, limit=10
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ userRole: UserRole.CANDIDATE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1, limit: 10 })
        );
    });

    it('UT_F04_21 – RECRUITER tìm kiếm – status bị override thành ACTIVE', async () => {
        /**
         * Input         : userRole=RECRUITER, status=DRAFT
         * Expected      : searchJobs nhận status=ACTIVE
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ userRole: UserRole.RECRUITER, status: 'DRAFT' });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ status: JobStatus.ACTIVE })
        );
    });

    it('UT_F04_22 – Kết quả trả về pagination đúng cấu trúc', async () => {
        /**
         * Input         : total=25, page=1, limit=10
         * Expected      : result.pagination có page, limit, total, totalPages
         */
        const pag = pagination(25);
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pag });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        const result = await uc.execute({ userRole: UserRole.CANDIDATE });

        expect(result.pagination).toEqual(pag);
    });

    it('UT_F04_23 – ADMIN tìm kiếm status=ACTIVE – không bị thay đổi', async () => {
        /**
         * Input         : userRole=ADMIN, status=ACTIVE
         * Expected      : searchJobs nhận status=ACTIVE
         */
        jobRepo.searchJobs.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new SearchJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ userRole: UserRole.ADMIN, status: JobStatus.ACTIVE });

        expect(jobRepo.searchJobs).toHaveBeenCalledWith(
            expect.objectContaining({ status: JobStatus.ACTIVE })
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-C: GetJobsByCompanyUseCase (6 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-C – GetJobsByCompanyUseCase', () => {
    let jobRepo: any;
    let companyRepo: any;
    let memberRepo: any;

    beforeEach(() => {
        jobRepo     = { findByCompanyId: jest.fn() };
        companyRepo = { findById: jest.fn() };
        memberRepo  = { findByCompanyAndUser: jest.fn() };
    });

    it('UT_F04_24 – CANDIDATE xem danh sách việc làm của công ty ACTIVE', async () => {
        /**
         * Input         : companyId="company-001", userRole=CANDIDATE
         * Expected      : Trả về danh sách jobs
         */
        companyRepo.findById.mockResolvedValue(buildCompany());
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        jobRepo.findByCompanyId.mockResolvedValue({ data: [buildJob()], pagination: pagination(1) });
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE });

        expect(result.data).toHaveLength(1);
    });

    it('UT_F04_25 – NotFoundError khi companyId không tồn tại', async () => {
        /**
         * Input         : companyId="ghost-company"
         * Expected      : NotFoundError
         */
        companyRepo.findById.mockResolvedValue(null);
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await expect(uc.execute({ companyId: 'ghost-company', userRole: UserRole.CANDIDATE }))
            .rejects.toThrow(NotFoundError);
    });

    it('UT_F04_26 – AuthorizationError khi công ty PENDING và user không phải admin/member', async () => {
        /**
         * Input         : company.status=PENDING, userRole=CANDIDATE, userId="user-001"
         * Expected      : AuthorizationError
         */
        companyRepo.findById.mockResolvedValue(buildCompany({ status: 'PENDING' }));
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await expect(uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE, userId: 'user-001' }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_27 – ADMIN xem được việc làm của công ty bất kỳ status', async () => {
        /**
         * Input         : company.status=PENDING, userRole=ADMIN
         * Expected      : Không AuthorizationError, trả về data
         */
        companyRepo.findById.mockResolvedValue(buildCompany({ status: 'PENDING' }));
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        jobRepo.findByCompanyId.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userRole: UserRole.ADMIN });

        expect(result.data).toHaveLength(0);
    });

    it('UT_F04_28 – CANDIDATE chỉ thấy tin ACTIVE của công ty', async () => {
        /**
         * Input         : userRole=CANDIDATE, không truyền status
         * Expected      : findByCompanyId nhận status=ACTIVE
         */
        companyRepo.findById.mockResolvedValue(buildCompany());
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        jobRepo.findByCompanyId.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE });

        expect(jobRepo.findByCompanyId).toHaveBeenCalledWith(
            'company-001',
            expect.objectContaining({ status: JobStatus.ACTIVE })
        );
    });

    it('UT_F04_29 – Company member (RECRUITER) xem được tất cả status', async () => {
        /**
         * Input         : RECRUITER là member của company-001, không truyền status
         * Expected      : findByCompanyId KHÔNG bị ép status=ACTIVE
         */
        companyRepo.findById.mockResolvedValue(buildCompany());
        memberRepo.findByCompanyAndUser.mockResolvedValue({ id: 'mem-001' });
        jobRepo.findByCompanyId.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new GetJobsByCompanyUseCase({ jobRepository: jobRepo, companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await uc.execute({ companyId: 'company-001', userId: 'rec-001', userRole: UserRole.RECRUITER });

        // Member không bị ép status → status là undefined (không phải 'ACTIVE')
        expect(jobRepo.findByCompanyId).toHaveBeenCalledWith(
            'company-001',
            expect.not.objectContaining({ status: JobStatus.ACTIVE })
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-D: GetSimilarJobsUseCase (5 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-D – GetSimilarJobsUseCase', () => {
    let jobRepo: any;

    beforeEach(() => {
        jobRepo = {
            findById: jest.fn(),
            findSimilarJobsFromTable: jest.fn(),
        };
    });

    it('UT_F04_30 – Trả về danh sách việc làm tương tự', async () => {
        /**
         * Input         : jobId="job-001", có 2 similar jobs
         * Expected      : result.data.length === 2
         */
        jobRepo.findById.mockResolvedValue(buildJob());
        jobRepo.findSimilarJobsFromTable.mockResolvedValue([
            buildSimilarJob({ id: 'job-002' }),
            buildSimilarJob({ id: 'job-003', title: 'Frontend Dev' }),
        ]);
        const uc = new GetSimilarJobsUseCase({ jobRepository: jobRepo });

        const result = await uc.execute({ jobId: 'job-001' });

        expect(result.data).toHaveLength(2);
    });

    it('UT_F04_31 – NotFoundError khi job gốc không tồn tại', async () => {
        /**
         * Input         : jobId="ghost" (không có trong DB)
         * Expected      : NotFoundError
         */
        jobRepo.findById.mockResolvedValue(null);
        const uc = new GetSimilarJobsUseCase({ jobRepository: jobRepo });

        await expect(uc.execute({ jobId: 'ghost' }))
            .rejects.toThrow(NotFoundError);
    });

    it('UT_F04_32 – Trả về mảng rỗng khi không có việc làm tương tự', async () => {
        /**
         * Input         : jobId="job-001", không có similar
         * Expected      : result.data = []
         */
        jobRepo.findById.mockResolvedValue(buildJob());
        jobRepo.findSimilarJobsFromTable.mockResolvedValue([]);
        const uc = new GetSimilarJobsUseCase({ jobRepository: jobRepo });

        const result = await uc.execute({ jobId: 'job-001' });

        expect(result.data).toHaveLength(0);
    });

    it('UT_F04_33 – Limit mặc định 10 được truyền vào repository', async () => {
        /**
         * Input         : không truyền limit
         * Expected      : findSimilarJobsFromTable gọi với limit=10, minSimilarity=0
         */
        jobRepo.findById.mockResolvedValue(buildJob());
        jobRepo.findSimilarJobsFromTable.mockResolvedValue([]);
        const uc = new GetSimilarJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ jobId: 'job-001' });

        expect(jobRepo.findSimilarJobsFromTable).toHaveBeenCalledWith('job-001', 10, 0);
    });

    it('UT_F04_34 – Limit tùy chỉnh và minSimilarity được truyền đúng', async () => {
        /**
         * Input         : limit=5, minSimilarity=0.7
         * Expected      : findSimilarJobsFromTable gọi với (jobId, 5, 0.7)
         */
        jobRepo.findById.mockResolvedValue(buildJob());
        jobRepo.findSimilarJobsFromTable.mockResolvedValue([]);
        const uc = new GetSimilarJobsUseCase({ jobRepository: jobRepo });

        await uc.execute({ jobId: 'job-001', limit: 5, minSimilarity: 0.7 });

        expect(jobRepo.findSimilarJobsFromTable).toHaveBeenCalledWith('job-001', 5, 0.7);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-E: CheckJobSavedUseCase (3 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-E – CheckJobSavedUseCase', () => {
    let savedJobRepo: any;

    beforeEach(() => {
        savedJobRepo = { isJobSaved: jest.fn() };
    });

    it('UT_F04_35 – Trả về isSaved=true khi đã lưu', async () => {
        /**
         * Input         : userId="user-001", jobId="job-001" đã lưu
         * Expected      : { isSaved: true }
         */
        savedJobRepo.isJobSaved.mockResolvedValue(true);
        const uc = new CheckJobSavedUseCase({ savedJobRepository: savedJobRepo });

        const result = await uc.execute({ userId: 'user-001', jobId: 'job-001' });

        expect(result.isSaved).toBe(true);
    });

    it('UT_F04_36 – Trả về isSaved=false khi chưa lưu', async () => {
        /**
         * Input         : userId="user-001", jobId="job-002" chưa lưu
         * Expected      : { isSaved: false }
         */
        savedJobRepo.isJobSaved.mockResolvedValue(false);
        const uc = new CheckJobSavedUseCase({ savedJobRepository: savedJobRepo });

        const result = await uc.execute({ userId: 'user-001', jobId: 'job-002' });

        expect(result.isSaved).toBe(false);
    });

    it('UT_F04_37 – isJobSaved được gọi đúng 1 lần với userId và jobId', async () => {
        /**
         * Input         : userId="u-abc", jobId="j-xyz"
         * Expected      : isJobSaved("u-abc", "j-xyz") gọi 1 lần
         */
        savedJobRepo.isJobSaved.mockResolvedValue(false);
        const uc = new CheckJobSavedUseCase({ savedJobRepository: savedJobRepo });

        await uc.execute({ userId: 'u-abc', jobId: 'j-xyz' });

        expect(savedJobRepo.isJobSaved).toHaveBeenCalledTimes(1);
        expect(savedJobRepo.isJobSaved).toHaveBeenCalledWith('u-abc', 'j-xyz');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-F: GetSavedJobsUseCase (5 TC)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-F – GetSavedJobsUseCase', () => {
    let savedJobRepo: any;

    beforeEach(() => {
        savedJobRepo = { findByUserId: jest.fn() };
    });

    it('UT_F04_38 – CANDIDATE xem danh sách việc làm đã lưu', async () => {
        /**
         * Input         : userId="user-001", userRole=CANDIDATE
         * Expected      : Trả về danh sách saved jobs
         */
        savedJobRepo.findByUserId.mockResolvedValue({ data: [buildSavedJob()], pagination: pagination(1) });
        const uc = new GetSavedJobsUseCase({ savedJobRepository: savedJobRepo });

        const result = await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].jobId).toBe('job-001');
    });

    it('UT_F04_39 – AuthorizationError khi RECRUITER xem saved jobs', async () => {
        /**
         * Input         : userRole=RECRUITER
         * Expected      : AuthorizationError (chỉ CANDIDATE được dùng)
         */
        const uc = new GetSavedJobsUseCase({ savedJobRepository: savedJobRepo });

        await expect(uc.execute({ userId: 'rec-001', userRole: UserRole.RECRUITER }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_40 – AuthorizationError khi ADMIN xem saved jobs', async () => {
        /**
         * Input         : userRole=ADMIN
         * Expected      : AuthorizationError
         */
        const uc = new GetSavedJobsUseCase({ savedJobRepository: savedJobRepo });

        await expect(uc.execute({ userId: 'admin-001', userRole: UserRole.ADMIN }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_41 – Trả về mảng rỗng khi chưa lưu job nào', async () => {
        /**
         * Input         : userId="user-002", chưa lưu job nào
         * Expected      : result.data = []
         */
        savedJobRepo.findByUserId.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new GetSavedJobsUseCase({ savedJobRepository: savedJobRepo });

        const result = await uc.execute({ userId: 'user-002', userRole: UserRole.CANDIDATE });

        expect(result.data).toHaveLength(0);
    });

    it('UT_F04_42 – Phân trang mặc định page=1, limit=10', async () => {
        /**
         * Input         : không truyền page/limit
         * Expected      : findByUserId gọi với page=1, limit=10
         */
        savedJobRepo.findByUserId.mockResolvedValue({ data: [], pagination: pagination(0) });
        const uc = new GetSavedJobsUseCase({ savedJobRepository: savedJobRepo });

        await uc.execute({ userId: 'user-001', userRole: UserRole.CANDIDATE });

        expect(savedJobRepo.findByUserId).toHaveBeenCalledWith(
            'user-001',
            expect.objectContaining({ page: 1, limit: 10 })
        );
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// F04-G: GetCompanyByIdUseCase (9 TC, gồm 2 [BUG] FAIL)
// ═════════════════════════════════════════════════════════════════════════════
describe('F04-G – GetCompanyByIdUseCase', () => {
    let companyRepo: any;
    let memberRepo: any;

    beforeEach(() => {
        companyRepo = {
            findByIdWithMembers:    jest.fn(),
            findByIdWithoutMembers: jest.fn(),
        };
        memberRepo = { findByCompanyAndUser: jest.fn() };
    });

    it('UT_F04_43 – CANDIDATE xem công ty ACTIVE thành công', async () => {
        /**
         * Input         : companyId="company-001", status=ACTIVE, userRole=CANDIDATE
         * Expected      : Trả về thông tin công ty
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithoutMembers.mockResolvedValue(buildCompany());
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE });

        expect(result.id).toBe('company-001');
        expect(result.status).toBe(UserStatus.ACTIVE);
    });

    it('UT_F04_44 – AuthorizationError khi công ty LOCKED và user không phải admin', async () => {
        /**
         * Input         : company.status=LOCKED, userRole=CANDIDATE
         * Expected      : AuthorizationError
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithoutMembers.mockResolvedValue(buildCompany({ status: UserStatus.LOCKED }));
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await expect(uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE }))
            .rejects.toThrow(AuthorizationError);
    });

    it('UT_F04_45 – ADMIN xem được công ty LOCKED', async () => {
        /**
         * Input         : company.status=LOCKED, userRole=ADMIN
         * Expected      : Trả về thông tin công ty
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithMembers.mockResolvedValue(buildCompany({ status: UserStatus.LOCKED }));
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userRole: UserRole.ADMIN });

        expect(result.status).toBe(UserStatus.LOCKED);
    });

    it('UT_F04_46 – NotFoundError khi companyId không tồn tại', async () => {
        /**
         * Input         : companyId="ghost-company"
         * Expected      : NotFoundError
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithoutMembers.mockResolvedValue(null);
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await expect(uc.execute({ companyId: 'ghost-company' }))
            .rejects.toThrow(NotFoundError);
    });

    it('UT_F04_47 – Admin gọi findByIdWithMembers (luôn xem được members)', async () => {
        /**
         * Input         : userRole=ADMIN
         * Expected      : findByIdWithMembers được gọi, findByIdWithoutMembers không gọi
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithMembers.mockResolvedValue(buildCompany({ members: [] }));
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await uc.execute({ companyId: 'company-001', userRole: UserRole.ADMIN });

        expect(companyRepo.findByIdWithMembers).toHaveBeenCalledWith('company-001');
        expect(companyRepo.findByIdWithoutMembers).not.toHaveBeenCalled();
    });

    it('UT_F04_48 – Non-member gọi findByIdWithoutMembers', async () => {
        /**
         * Input         : userRole=CANDIDATE, không phải member
         * Expected      : findByIdWithoutMembers được gọi
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue(null);
        companyRepo.findByIdWithoutMembers.mockResolvedValue(buildCompany());
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        await uc.execute({ companyId: 'company-001', userRole: UserRole.CANDIDATE, userId: 'user-001' });

        expect(companyRepo.findByIdWithoutMembers).toHaveBeenCalledWith('company-001');
        expect(companyRepo.findByIdWithMembers).not.toHaveBeenCalled();
    });

    it('UT_F04_49 – Company member gọi findByIdWithMembers và thấy được members', async () => {
        /**
         * Input         : userId là member của company-001
         * Expected      : findByIdWithMembers gọi, result.members có 1 item
         */
        memberRepo.findByCompanyAndUser.mockResolvedValue({ id: 'mem-001' });
        companyRepo.findByIdWithMembers.mockResolvedValue(
            buildCompany({
                members: [{ id: 'mem-001', userId: 'rec-001', companyId: 'company-001', companyRole: 'OWNER', createdAt: now, updatedAt: now }],
            })
        );
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userId: 'rec-001', userRole: UserRole.RECRUITER });

        expect(companyRepo.findByIdWithMembers).toHaveBeenCalledWith('company-001');
        expect(result.members).toHaveLength(1);
    });


    it('UT_F04_50 – ompany member xem công ty LOCKED của mình bị AuthorizationError', async () => {
        /**
         * Test Case ID  : UT_F04_50
         * Mục tiêu      : Thành viên công ty phải xem được công ty dù bị LOCKED
         * Input         : userId là member, company.status=LOCKED, userRole=RECRUITER
         * Expected (đúng): Trả về thông tin công ty (member nên được phép xem)
        memberRepo.findByCompanyAndUser.mockResolvedValue({ id: 'mem-001' }); // IS member
        companyRepo.findByIdWithMembers.mockResolvedValue(
            buildCompany({ status: UserStatus.LOCKED, members: [{ id: 'mem-001' }] })
        );
        const uc = new GetCompanyByIdUseCase({ companyRepository: companyRepo, companyMemberRepository: memberRepo });

        const result = await uc.execute({ companyId: 'company-001', userId: 'rec-001', userRole: UserRole.RECRUITER });
        expect(result.id).toBe('company-001');
    });
});