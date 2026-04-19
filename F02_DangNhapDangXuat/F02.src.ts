// F02 – Đăng nhập / Đăng xuất: Source implementation extracted for coverage measurement

export enum UserRole   { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
export enum UserStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', PENDING = 'PENDING', SUSPENDED = 'SUSPENDED', INACTIVE = 'INACTIVE' }

export class AuthenticationError extends Error {
  statusCode = 401;
  constructor(message: string) { super(message); this.name = 'AuthenticationError'; }
}
export class BusinessRuleError extends Error {
  statusCode = 422;
  constructor(message: string) { super(message); this.name = 'BusinessRuleError'; }
}
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) { super(message); this.name = 'NotFoundError'; }
}

export interface ILoginUserRepository {
  findByEmail(email: string): Promise<any | null>;
  updateLastLogin(id: string): Promise<any>;
}
export interface IPasswordService {
  compare(plain: string, hash: string): Promise<boolean>;
}
export interface ITokenService {
  generate(payload: { userId: string; email: string; role: string }): string;
  getExpiresIn(): string;
}

export class LoginUserUseCase {
  constructor(
    private userRepository: ILoginUserRepository,
    private passwordService: IPasswordService,
    private tokenService: ITokenService,
  ) {}

  async execute(input: { email: string; password: string }) {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) throw new AuthenticationError('Invalid email or password');

    if (user.status !== UserStatus.ACTIVE) {
      const messages: Record<string, string> = {
        [UserStatus.LOCKED]:    'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.',
        [UserStatus.SUSPENDED]: 'Tài khoản của bạn đã bị tạm ngưng. Vui lòng liên hệ quản trị viên.',
        [UserStatus.INACTIVE]:  'Tài khoản của bạn không hoạt động. Vui lòng liên hệ quản trị viên.',
        [UserStatus.PENDING]:   'Tài khoản của bạn đang chờ duyệt. Vui lòng liên hệ quản trị viên.',
      };
      throw new BusinessRuleError(messages[user.status] ?? 'Tài khoản không hoạt động.');
    }

    const isPasswordValid = await this.passwordService.compare(input.password, user.passwordHash);
    if (!isPasswordValid) throw new AuthenticationError('Invalid email or password');

    await this.userRepository.updateLastLogin(user.id);
    const token = this.tokenService.generate({ userId: user.id, email: user.email, role: user.role });

    return { user, token, expiresIn: this.tokenService.getExpiresIn() };
  }
}

export interface ILogoutUserRepository {
  findById(id: string): Promise<any | null>;
  update(id: string, data: Record<string, unknown>): Promise<any>;
}

export class LogoutUserUseCase {
  constructor(private readonly userRepository: ILogoutUserRepository) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.userRepository.update(user.id, { lastLogoutAt: new Date() });
  }
}
