/**
 * @file    ApplicationUseCases.ts
 * @module  src/F08
 * @desc    Source file cho F08 – Ứng tuyển việc làm.
 *          File này chứa logic nghiệp vụ được trích từ source code gốc
 *          BE-Jobs-connect để phục vụ đo code coverage.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────
export enum UserRole {
  CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN',
}
export enum ApplicationStatus {
  PENDING = 'PENDING', REVIEWING = 'REVIEWING', ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED', CANCELLED = 'CANCELLED',
}

// ─── Errors ──────────────────────────────────────────────────────────────────
export class AppError extends Error { constructor(msg: string, public statusCode = 500) { super(msg); } }
export class AuthorizationError extends AppError { constructor(m: string) { super(m, 403); this.name = 'AuthorizationError'; } }
export class NotFoundError      extends AppError { constructor(m: string) { super(m, 404); this.name = 'NotFoundError'; } }

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface IApplicationRepository {
  findActiveByUserAndJob(userId: string, jobId: string): Promise<any | null>;
  save(app: any): Promise<any>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}
export interface IJobRepository {
  findById(id: string): Promise<any | null>;
  incrementApplicationCount(id: string): Promise<any>;
}
export interface ICVRepository    { findById(id: string): Promise<any | null>; }
export interface ICompanyRepository { findById(id: string): Promise<any | null>; }
export interface ICompanyMemberRepository {
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}
export interface INotificationService {
  notifyNewApplication(applicationId: string): Promise<void>;
}

// ─── A. ApplyJobUseCase ───────────────────────────────────────────────────────
export class ApplyJobUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private cvRepo: ICVRepository,
    private companyRepo: ICompanyRepository,
    private notifySvc: INotificationService,
  ) {}
  async execute(input: {
    userId: string; userRole: string; jobId: string;
    cvId: string; coverLetter?: string;
  }) {
    const { userId, userRole, jobId, cvId, coverLetter } = input;
    if (userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Chỉ ứng viên mới có thể ứng tuyển');
    const job = await this.jobRepo.findById(jobId);
    if (!job) throw new Error('Không tìm thấy tin tuyển dụng');
    if (job.status === 'LOCKED')   throw new Error('Tin tuyển dụng đã bị khóa và không thể nhận đơn ứng tuyển');
    if (job.status === 'INACTIVE') throw new Error('Tin tuyển dụng đã đóng');
    if (job.isExpired && job.isExpired()) throw new Error('Tin tuyển dụng đã hết hạn, không thể ứng tuyển');
    if (!(job.isActive && job.isActive())) throw new Error('Tin tuyển dụng không ở trạng thái có thể nhận đơn ứng tuyển');
    const company = await this.companyRepo.findById(job.companyId);
    if (company?.status === 'LOCKED') throw new Error('Công ty đã bị khóa và không thể nhận đơn ứng tuyển');
    const cv = await this.cvRepo.findById(cvId);
    if (!cv) throw new Error('Không tìm thấy CV');
    if (cv.userId !== userId) throw new Error('CV không thuộc về người dùng này');
    const existing = await this.appRepo.findActiveByUserAndJob(userId, jobId);
    if (existing) throw new Error('Bạn đã ứng tuyển cho tin tuyển dụng này');
    const saved = await this.appRepo.save({
      userId, jobId, cvId,
      coverLetter: coverLetter ?? null,
      status: ApplicationStatus.PENDING,
    });
    await this.jobRepo.incrementApplicationCount(jobId);
    this.notifySvc.notifyNewApplication(saved.id).catch(() => {});
    return await this.appRepo.findByIdWithRelations(saved.id);
  }
}

// ─── B. WithdrawApplicationUseCase ───────────────────────────────────────────
export class WithdrawApplicationUseCase {
  constructor(private appRepo: IApplicationRepository) {}
  async execute(input: { applicationId: string; userId: string }) {
    const app = await this.appRepo.findByIdWithRelations(input.applicationId);
    if (!app) throw new Error('Application not found');
    if (app.userId !== input.userId)
      throw new Error('You do not have permission to withdraw this application');
    if (!app.canBeWithdrawn())
      throw new Error('Chỉ có thể rút đơn ứng tuyển khi đơn đang ở trạng thái chờ xử lý');
    const updated = await this.appRepo.update(input.applicationId, { status: ApplicationStatus.CANCELLED });
    return await this.appRepo.findByIdWithRelations(updated.id);
  }
}

// ─── C. GetApplicationByIdUseCase ─────────────────────────────────────────────
export class GetApplicationByIdUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}
  async execute(input: { applicationId: string; userId: string; userRole: string }) {
    const { applicationId, userId, userRole } = input;
    const app = await this.appRepo.findByIdWithRelations(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    if (app.userId === userId) return app;
    if (userRole === UserRole.ADMIN) return app;
    if (userRole === UserRole.RECRUITER) {
      const job = await this.jobRepo.findById(app.jobId);
      if (job) {
        const member = await this.memberRepo.findByCompanyAndUser(job.companyId, userId);
        if (member) return app;
      }
    }
    throw new AuthorizationError('You do not have permission to view this application');
  }
}

// ─── D. UpdateApplicationStatusUseCase ───────────────────────────────────────
export class UpdateApplicationStatusUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}
  async execute(input: {
    applicationId: string; userId: string; userRole: string;
    status: ApplicationStatus; notes?: string;
  }) {
    const { applicationId, userId, userRole, status, notes } = input;
    const app = await this.appRepo.findByIdWithRelations(applicationId);
    if (!app) throw new NotFoundError('Application not found');
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isAdmin) {
      if (userRole !== UserRole.RECRUITER)
        throw new AuthorizationError('Only recruiters and admins can update application status');
      const job = await this.jobRepo.findById(app.jobId);
      if (!job) throw new NotFoundError('Job not found');
      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, userId);
      if (!member) throw new AuthorizationError('You must be a member of the company that owns this job');
    }
    if (!this.isValidTransition(app.status, status))
      throw new Error(`Invalid status transition from ${app.status} to ${status}`);
    const updated = await this.appRepo.update(applicationId, { status, notes: notes ?? null });
    return await this.appRepo.findByIdWithRelations(updated.id);
  }
  private isValidTransition(cur: ApplicationStatus, next: ApplicationStatus): boolean {
    const valid: Record<ApplicationStatus, ApplicationStatus[]> = {
      [ApplicationStatus.PENDING]:   [ApplicationStatus.REVIEWING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.REVIEWING]: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.ACCEPTED]:  [],
      [ApplicationStatus.REJECTED]:  [],
      [ApplicationStatus.CANCELLED]: [],
    };
    return valid[cur]?.includes(next) ?? false;
  }
}
