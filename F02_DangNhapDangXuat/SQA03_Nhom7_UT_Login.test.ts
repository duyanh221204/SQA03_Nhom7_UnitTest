/**
 * @file SQA03_Nhom7_UT_Login.test.ts
 * @module F02_DangNhapDangXuat
 * @description Unit tests for LoginUserUseCase – F02: Đăng nhập tài khoản
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Đăng nhập thành công với email/password đúng
 *  - Đăng nhập thất bại khi email không tồn tại
 *  - Đăng nhập thất bại khi mật khẩu sai
 *  - Đăng nhập thất bại khi tài khoản bị khóa / tạm ngưng / không hoạt động / đang chờ duyệt
 *  - Cập nhật lastLoginAt sau khi đăng nhập thành công
 *  - Trả về JWT token hợp lệ
 */

// =====================================================================
// INLINE TYPES & ERRORS
// =====================================================================
enum UserRole  { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
enum UserStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', PENDING = 'PENDING', SUSPENDED = 'SUSPENDED', INACTIVE = 'INACTIVE' }

class AuthenticationError extends Error {
  statusCode = 401;
  constructor(message: string) { super(message); this.name = 'AuthenticationError'; }
}
class BusinessRuleError extends Error {
  statusCode = 422;
  constructor(message: string) { super(message); this.name = 'BusinessRuleError'; }
}

// =====================================================================
// INLINE USE CASE
// =====================================================================
interface IUserRepository {
  findByEmail(email: string): Promise<any | null>;
  updateLastLogin(id: string): Promise<any>;
}
interface IPasswordService {
  compare(plain: string, hash: string): Promise<boolean>;
}
interface ITokenService {
  generate(payload: { userId: string; email: string; role: string }): string;
  getExpiresIn(): string;
}

class LoginUserUseCase {
  constructor(
    private userRepository: IUserRepository,
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

// =====================================================================
// HELPERS
// =====================================================================
const buildActiveUser = (overrides: any = {}) => ({
  id: 'user-001',
  email: 'user@example.com',
  passwordHash: '$2b$10$hashed',
  fullName: 'Nguyễn Văn A',
  role: UserRole.CANDIDATE,
  status: UserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const makeMocks = (userOverrides: any = {}, passwordResult = true) => {
  const user = buildActiveUser(userOverrides);
  const userRepo: jest.Mocked<IUserRepository> = {
    findByEmail: jest.fn().mockResolvedValue(userOverrides.notFound ? null : user),
    updateLastLogin: jest.fn().mockResolvedValue(user),
  };
  const passwordSvc: jest.Mocked<IPasswordService> = {
    compare: jest.fn().mockResolvedValue(passwordResult),
  };
  const tokenSvc: jest.Mocked<ITokenService> = {
    generate: jest.fn().mockReturnValue('jwt_token_abc123'),
    getExpiresIn: jest.fn().mockReturnValue('7d'),
  };
  return { userRepo, passwordSvc, tokenSvc };
};

// =====================================================================
// TEST SUITE
// =====================================================================
describe('F02 - Đăng nhập tài khoản | LoginUserUseCase', () => {

  it('UT_F02_01 – Đăng nhập thành công với email và mật khẩu đúng', async () => {
    /**
     * Test Case ID : UT_F02_01
     * Test Objective: Xác minh luồng đăng nhập thành công
     * Input         : email="user@example.com", password="correct_password"
     * Expected Output: Trả về { user, token: "jwt_...", expiresIn: "7d" }
     * Notes         : CheckDB – updateLastLogin() phải được gọi đúng 1 lần với userId
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    const result = await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(result.token).toBe('jwt_token_abc123');
    expect(result.expiresIn).toBe('7d');
    expect(result.user.id).toBe('user-001');

    // CheckDB: lastLogin phải được cập nhật
    expect(userRepo.updateLastLogin).toHaveBeenCalledWith('user-001');
    expect(userRepo.updateLastLogin).toHaveBeenCalledTimes(1);
  });

  it('UT_F02_02 – Đăng nhập thất bại khi email không tồn tại trong hệ thống', async () => {
    /**
     * Test Case ID : UT_F02_02
     * Test Objective: Xác minh AuthenticationError khi email không tìm thấy
     * Input         : email="notfound@example.com" (không có trong DB)
     * Expected Output: Ném AuthenticationError "Invalid email or password"
     * Notes         : CheckDB – updateLastLogin() KHÔNG được gọi
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ notFound: true });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'notfound@example.com', password: 'any' }))
      .rejects.toThrow(AuthenticationError);

    expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
  });

  it('UT_F02_03 – Đăng nhập thất bại khi mật khẩu không đúng', async () => {
    /**
     * Test Case ID : UT_F02_03
     * Test Objective: Xác minh AuthenticationError khi mật khẩu sai
     * Input         : email đúng, password="wrong_password"
     * Expected Output: Ném AuthenticationError "Invalid email or password"
     * Notes         : CheckDB – updateLastLogin() KHÔNG được gọi
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({}, false); // passwordResult=false
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'wrong_password' }))
      .rejects.toThrow(AuthenticationError);

    expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
  });

  it('UT_F02_04 – Đăng nhập thất bại khi tài khoản bị khóa (LOCKED)', async () => {
    /**
     * Test Case ID : UT_F02_04
     * Test Objective: Xác minh BusinessRuleError khi tài khoản LOCKED
     * Input         : user.status=LOCKED
     * Expected Output: BusinessRuleError chứa "bị khóa"
     * Notes         : CheckDB – updateLastLogin() KHÔNG được gọi
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.LOCKED });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(BusinessRuleError);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(/bị khóa/);

    expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
  });

  it('UT_F02_05 – Đăng nhập thất bại khi tài khoản bị tạm ngưng (SUSPENDED)', async () => {
    /**
     * Test Case ID : UT_F02_05
     * Test Objective: Xác minh BusinessRuleError khi tài khoản SUSPENDED
     * Input         : user.status=SUSPENDED
     * Expected Output: BusinessRuleError chứa "tạm ngưng"
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.SUSPENDED });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(/tạm ngưng/);
  });

  it('UT_F02_06 – Đăng nhập thất bại khi tài khoản đang chờ duyệt (PENDING)', async () => {
    /**
     * Test Case ID : UT_F02_06
     * Test Objective: Xác minh BusinessRuleError khi tài khoản PENDING
     * Input         : user.status=PENDING
     * Expected Output: BusinessRuleError chứa "chờ duyệt"
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.PENDING });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(/chờ duyệt/);
  });

  it('UT_F02_07 – Đăng nhập thất bại khi tài khoản INACTIVE', async () => {
    /**
     * Test Case ID : UT_F02_07
     * Test Objective: Xác minh BusinessRuleError khi tài khoản INACTIVE
     * Input         : user.status=INACTIVE
     * Expected Output: BusinessRuleError
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.INACTIVE });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(BusinessRuleError);
  });

  it('UT_F02_08 – Token được tạo với đúng payload (userId, email, role)', async () => {
    /**
     * Test Case ID : UT_F02_08
     * Test Objective: Xác minh tokenService.generate() được gọi với payload đúng
     * Input         : user hợp lệ
     * Expected Output: generate() nhận { userId, email, role }
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(tokenSvc.generate).toHaveBeenCalledWith({
      userId: 'user-001',
      email: 'user@example.com',
      role: UserRole.CANDIDATE,
    });
  });
});
