// F12 – Quản lý đơn ứng tuyển (NTD): Source implementation extracted for coverage measurement

export enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

export enum ApplicationStatus {
  PENDING   = 'PENDING',
  REVIEWING = 'REVIEWING',
  ACCEPTED  = 'ACCEPTED',
  REJECTED  = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export class AuthorizationError extends Error {
  statusCode = 403;
  constructor(msg: string) { super(msg); this.name = 'AuthorizationError'; }
}
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}

export interface IApplicationRepository {
  findByJobId(jobId: string, opts: any): Promise<{ data: any[]; pagination: any }>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}
export interface IJobRepository {
  findById(id: string): Promise<any | null>;
}
export interface ICompanyMemberRepository {
  findByCompanyAndUser(companyId: string, userId: string): Promise<any | null>;
}

export class GetApplicationsByJobUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}

  async execute(input: {
    jobId: string;
    userId: string;
    userRole: string;
    page?: number;
    limit?: number;
    status?: string;
  }) {
    const job = await this.jobRepo.findById(input.jobId);
    if (!job) throw new Error('Job not found');

    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isAdmin) {
      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, input.userId);
      if (!member)
        throw new AuthorizationError('You do not have permission to view applications for this job');
    }

    const result = await this.appRepo.findByJobId(input.jobId, {
      page: input.page ?? 1,
      limit: input.limit ?? 10,
      status: input.status,
      includeRelations: true,
    });

    return { data: result.data, pagination: result.pagination };
  }
}

export class UpdateApplicationStatusUseCase {
  constructor(
    private appRepo: IApplicationRepository,
    private jobRepo: IJobRepository,
    private memberRepo: ICompanyMemberRepository,
  ) {}

  private isValidTransition(current: ApplicationStatus, next: ApplicationStatus): boolean {
    const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
      [ApplicationStatus.PENDING]:   [ApplicationStatus.REVIEWING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.REVIEWING]: [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED, ApplicationStatus.CANCELLED],
      [ApplicationStatus.ACCEPTED]:  [],
      [ApplicationStatus.REJECTED]:  [],
      [ApplicationStatus.CANCELLED]: [],
    };
    return transitions[current]?.includes(next) ?? false;
  }

  async execute(input: {
    applicationId: string;
    userId: string;
    userRole: string;
    status: ApplicationStatus;
    notes?: string;
  }) {
    const application = await this.appRepo.findByIdWithRelations(input.applicationId);
    if (!application) throw new NotFoundError('Application not found');

    const isAdmin = input.userRole === UserRole.ADMIN;

    if (!isAdmin) {
      if (input.userRole !== UserRole.RECRUITER)
        throw new AuthorizationError('Only recruiters and admins can update application status');

      const job = await this.jobRepo.findById(application.jobId);
      if (!job) throw new NotFoundError('Job not found');

      const member = await this.memberRepo.findByCompanyAndUser(job.companyId, input.userId);
      if (!member)
        throw new AuthorizationError('You must be a member of the company that owns this job');
    }

    if (!this.isValidTransition(application.status, input.status))
      throw new Error(`Invalid status transition from ${application.status} to ${input.status}`);

    const updated = await this.appRepo.update(input.applicationId, {
      status: input.status,
      notes: input.notes,
    });

    return await this.appRepo.findByIdWithRelations(updated.id);
  }
}
