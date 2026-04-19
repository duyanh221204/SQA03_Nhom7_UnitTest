// F03 – Quản lý việc làm đã ứng tuyển: Source implementation extracted for coverage measurement

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
  constructor(message: string) { super(message); this.name = 'AuthorizationError'; }
}

export interface IApplicationRepository {
  findByUserId(userId: string, options?: any): Promise<{ data: any[]; pagination: any }>;
  findByIdWithRelations(id: string): Promise<any | null>;
  update(id: string, data: any): Promise<any>;
}

export class GetMyApplicationsUseCase {
  constructor(private readonly applicationRepository: IApplicationRepository) {}

  async execute(input: { userId: string; userRole: string; page?: number; limit?: number; status?: string }) {
    if (input.userRole !== UserRole.CANDIDATE)
      throw new AuthorizationError('Only candidates can view their applications');

    const result = await this.applicationRepository.findByUserId(input.userId, {
      page: input.page ?? 1,
      limit: input.limit ?? 20,
      status: input.status,
      includeRelations: true,
    });

    return { data: result.data, pagination: result.pagination };
  }
}

export class WithdrawApplicationUseCase {
  constructor(private readonly applicationRepository: IApplicationRepository) {}

  async execute(input: { applicationId: string; userId: string }) {
    const application = await this.applicationRepository.findByIdWithRelations(input.applicationId);
    if (!application) throw new Error('Application not found');

    if (application.userId !== input.userId)
      throw new Error('You do not have permission to withdraw this application');

    // canBeWithdrawn: chỉ cho phép khi PENDING
    const canWithdraw = application.status === ApplicationStatus.PENDING;
    if (!canWithdraw)
      throw new Error('Chỉ có thể rút đơn ứng tuyển khi đơn đang ở trạng thái chờ xử lý');

    const updated = await this.applicationRepository.update(input.applicationId, {
      status: ApplicationStatus.CANCELLED,
    });

    return await this.applicationRepository.findByIdWithRelations(updated.id);
  }
}
