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
// IMPORT FROM SOURCE FILE (enables Jest coverage measurement)
// =====================================================================
import {
  UserRole,
  UserStatus,
  AuthenticationError,
  BusinessRuleError,
  ILoginUserRepository as IUserRepository,
  IPasswordService,
  ITokenService,
  LoginUserUseCase,
} from './F02.src';

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

  it('UT_F02_11 – tokenService.getExpiresIn() được gọi và kết quả trả về đúng', async () => {
    /**
     * Test Case ID : UT_F02_11
     * Test Objective: Xác minh expiresIn được lấy từ tokenService và trả về trong response
     * Input         : user hợp lệ, tokenSvc.getExpiresIn() trả về "7d"
     * Expected Output: getExpiresIn() được gọi 1 lần; result.expiresIn === "7d"
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    const result = await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(tokenSvc.getExpiresIn).toHaveBeenCalledTimes(1);
    expect(result.expiresIn).toBe('7d');
  });

  it('UT_F02_12 – passwordService.compare() được gọi với đúng plaintext và hash của user', async () => {
    /**
     * Test Case ID : UT_F02_12
     * Test Objective: Xác minh so sánh mật khẩu sử dụng đúng cặp (plaintext, hash)
     * Input         : password="correct_password", user.passwordHash="$2b$10$hashed"
     * Expected Output: compare() được gọi với ("correct_password", "$2b$10$hashed")
     * Notes         : Bảo mật – phải so sánh đúng cặp, không nhầm lẫn
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(passwordSvc.compare).toHaveBeenCalledWith('correct_password', '$2b$10$hashed');
  });

  it('UT_F02_13 – findByEmail() được gọi đúng 1 lần với email được nhập', async () => {
    /**
     * Test Case ID : UT_F02_13
     * Test Objective: Xác minh tra cứu user bằng email chính xác
     * Input         : email="user@example.com"
     * Expected Output: findByEmail() được gọi đúng 1 lần với "user@example.com"
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(userRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(userRepo.findByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('UT_F02_14 – passwordService.compare() KHÔNG được gọi khi tài khoản bị LOCKED', async () => {
    /**
     * Test Case ID : UT_F02_14
     * Test Objective: Xác minh không tốn chi phí hash compare khi tài khoản bị khóa
     * Input         : user.status=LOCKED
     * Expected Output: BusinessRuleError; passwordSvc.compare() KHÔNG được gọi
     * Notes         : Tối ưu bảo mật – không so sánh mật khẩu khi tài khoản không hợp lệ
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.LOCKED });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(BusinessRuleError);

    expect(passwordSvc.compare).not.toHaveBeenCalled();
  });

  it('UT_F02_17 – Kết quả đăng nhập thành công trả về user object với đầy đủ trường', async () => {
    /**
     * Test Case ID : UT_F02_17
     * Test Objective: Xác minh response có user object đầy đủ (id, email, role, status)
     * Input         : Đăng nhập hợp lệ
     * Expected Output: result.user có id="user-001", email="user@example.com", role, status
     * Notes         : Đảm bảo client nhận đủ thông tin hiển thị sau khi đăng nhập
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    const result = await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(result.user).toHaveProperty('id', 'user-001');
    expect(result.user).toHaveProperty('email', 'user@example.com');
    expect(result.user).toHaveProperty('role');
    expect(result.user).toHaveProperty('status');
  });

  it('UT_F02_18 – Token trả về là chuỗi không rỗng', async () => {
    /**
     * Test Case ID : UT_F02_18
     * Test Objective: Xác minh token JWT được tạo ra và là chuỗi hợp lệ
     * Input         : Đăng nhập hợp lệ
     * Expected Output: result.token là string có độ dài > 0
     * Notes         : Bảo mật – token phải tồn tại để client sử dụng các API khác
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks();
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    const result = await useCase.execute({ email: 'user@example.com', password: 'correct_password' });

    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('UT_F02_19 – updateLastLogin() KHÔNG được gọi khi tài khoản SUSPENDED', async () => {
    /**
     * Test Case ID : UT_F02_19
     * Test Objective: Xác minh không cập nhật lastLogin khi tài khoản bị tạm ngưng
     * Input         : user.status=SUSPENDED
     * Expected Output: BusinessRuleError; userRepo.updateLastLogin() KHÔNG được gọi
     * Notes         : Rollback – lastLoginAt phải giữ nguyên giá trị cũ trong DB
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.SUSPENDED });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(BusinessRuleError);

    expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
  });

  it('UT_F02_20 – updateLastLogin() KHÔNG được gọi khi tài khoản PENDING', async () => {
    /**
     * Test Case ID : UT_F02_20
     * Test Objective: Xác minh không cập nhật lastLogin khi tài khoản chờ duyệt
     * Input         : user.status=PENDING
     * Expected Output: BusinessRuleError; userRepo.updateLastLogin() KHÔNG được gọi
     * Notes         : Rollback – lastLoginAt phải giữ nguyên; tài khoản chưa được kích hoạt
     */
    const { userRepo, passwordSvc, tokenSvc } = makeMocks({ status: UserStatus.PENDING });
    const useCase = new LoginUserUseCase(userRepo, passwordSvc, tokenSvc);

    await expect(useCase.execute({ email: 'user@example.com', password: 'any' }))
      .rejects.toThrow(BusinessRuleError);

    expect(userRepo.updateLastLogin).not.toHaveBeenCalled();
  });
});
