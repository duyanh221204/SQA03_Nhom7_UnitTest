// F01 – Đăng ký tài khoản: Source implementation extracted for coverage measurement

export enum UserRole   { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
export enum UserStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', PENDING = 'PENDING', SUSPENDED = 'SUSPENDED', INACTIVE = 'INACTIVE' }

export class ConflictError extends Error {
  statusCode = 409;
  constructor(message: string) { super(message); this.name = 'ConflictError'; }
}

export interface IUserRepository {
  findByEmail(email: string): Promise<any | null>;
  create(data: any): Promise<any>;
}
export interface IPasswordService {
  hash(password: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  validate(password: string): { isValid: boolean; errors: string[] };
}

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordService: IPasswordService
  ) {}

  async execute(input: {
    email: string;
    password: string;
    fullName?: string | null;
    phoneNumber?: string | null;
    gender?: string | null;
    role?: string;
    dateOfBirth?: Date | null;
  }) {
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) throw new ConflictError('Email already exists');

    const passwordHash = await this.passwordService.hash(input.password);

    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName ?? null,
      phoneNumber: input.phoneNumber ?? null,
      gender: input.gender ?? null,
      role: input.role ?? UserRole.CANDIDATE,
      dateOfBirth: input.dateOfBirth ?? null,
      status: UserStatus.ACTIVE,
      avatarUrl: null,
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      role: user.role,
      dateOfBirth: user.dateOfBirth,
      status: user.status,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
