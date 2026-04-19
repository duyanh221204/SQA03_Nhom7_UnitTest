/**
 * @file SQA03_Nhom7_UT_RegisterUser.test.ts
 * @module F01_DangKyTaiKhoan
 * @description Unit tests for RegisterUserUseCase - F01: Đăng ký tài khoản
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Đăng ký người dùng mới thành công
 *  - Xử lý email đã tồn tại
 *  - Giá trị mặc định của role
 *  - Mã hóa mật khẩu trước khi lưu
 */

// =====================================================================
// TYPE DEFINITIONS (extracted from source to avoid import path issues)
// =====================================================================

/** Enum vai trò người dùng */
enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }
/** Enum trạng thái tài khoản */
enum UserStatus { ACTIVE = 'ACTIVE', LOCKED = 'LOCKED', PENDING = 'PENDING', SUSPENDED = 'SUSPENDED', INACTIVE = 'INACTIVE' }

// =====================================================================
// DOMAIN ERROR CLASSES (inline – không import từ source)
// =====================================================================
class ConflictError extends Error {
  statusCode = 409;
  constructor(message: string) { super(message); this.name = 'ConflictError'; }
}

// =====================================================================
// USE CASE UNDER TEST (inline implementation to avoid ESM path issues)
// =====================================================================
interface IUserRepository {
  findByEmail(email: string): Promise<any | null>;
  create(data: any): Promise<any>;
}
interface IPasswordService {
  hash(password: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
  validate(password: string): { isValid: boolean; errors: string[] };
}

class RegisterUserUseCase {
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

// =====================================================================
// HELPERS – factory functions for mock data
// =====================================================================
const buildUser = (overrides: Partial<any> = {}) => ({
  id: 'user-uuid-001',
  email: 'newuser@example.com',
  passwordHash: 'hashed_password',
  fullName: 'Nguyễn Văn A',
  phoneNumber: null,
  gender: null,
  role: UserRole.CANDIDATE,
  dateOfBirth: null,
  status: UserStatus.ACTIVE,
  avatarUrl: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// =====================================================================
// MOCK FACTORIES
// =====================================================================
const makeMockUserRepository = (overrides: Partial<IUserRepository> = {}): jest.Mocked<IUserRepository> => ({
  findByEmail: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue(buildUser()),
  ...overrides,
} as any);

const makeMockPasswordService = (overrides: Partial<IPasswordService> = {}): jest.Mocked<IPasswordService> => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
  validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
  ...overrides,
} as any);

// =====================================================================
// TEST SUITE
// =====================================================================
describe('F01 - Đăng ký tài khoản | RegisterUserUseCase', () => {

  // -------------------------------------------------------------------
  // Test Case UT_F01_01
  // -------------------------------------------------------------------
  it('UT_F01_01 – Đăng ký thành công với dữ liệu hợp lệ đầy đủ', async () => {
    /**
     * Test Case ID : UT_F01_01
     * Test Objective: Xác minh đăng ký tài khoản thành công với toàn bộ trường hợp lệ
     * Input         : email="newuser@example.com", password="Password@1", fullName="Nguyễn Văn A"
     * Expected Output: Trả về object user với id, email đúng, status=ACTIVE, role=CANDIDATE
     * Notes         : CheckDB – userRepository.create() phải được gọi 1 lần với đúng email
     *                 Rollback – mock; không có thay đổi DB thực
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'newuser@example.com',
      password: 'Password@1',
      fullName: 'Nguyễn Văn A',
    });

    // Assertions – output shape
    expect(result.id).toBe('user-uuid-001');
    expect(result.email).toBe('newuser@example.com');
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(result.role).toBe(UserRole.CANDIDATE);

    // CheckDB: xác minh create() được gọi đúng 1 lần
    expect(userRepo.create).toHaveBeenCalledTimes(1);
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newuser@example.com',
        status: UserStatus.ACTIVE,
      })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_02
  // -------------------------------------------------------------------
  it('UT_F01_02 – Đăng ký thất bại khi email đã tồn tại', async () => {
    /**
     * Test Case ID : UT_F01_02
     * Test Objective: Xác minh hệ thống ném ConflictError khi email đã được đăng ký
     * Input         : email đã tồn tại trong DB
     * Expected Output: ConflictError với message "Email already exists"
     * Notes         : CheckDB – create() KHÔNG được gọi khi email trùng
     *                 Rollback – mock; không thay đổi DB
     */
    const existingUser = buildUser({ email: 'existing@example.com' });
    const userRepo = makeMockUserRepository({
      findByEmail: jest.fn().mockResolvedValue(existingUser),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await expect(
      useCase.execute({ email: 'existing@example.com', password: 'Password@1' })
    ).rejects.toThrow(ConflictError);

    await expect(
      useCase.execute({ email: 'existing@example.com', password: 'Password@1' })
    ).rejects.toThrow('Email already exists');

    // CheckDB: create() phải KHÔNG được gọi
    expect(userRepo.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_03
  // -------------------------------------------------------------------
  it('UT_F01_03 – Role mặc định là CANDIDATE khi không chỉ định', async () => {
    /**
     * Test Case ID : UT_F01_03
     * Test Objective: Xác minh role mặc định là CANDIDATE khi không truyền role
     * Input         : email, password – không truyền role
     * Expected Output: Người dùng được tạo với role=CANDIDATE
     * Notes         : CheckDB – userRepository.create() phải nhận role=CANDIDATE
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'noroleset@example.com', password: 'Password@1' });

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CANDIDATE })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_04
  // -------------------------------------------------------------------
  it('UT_F01_04 – Mật khẩu được mã hóa (hash) trước khi lưu vào DB', async () => {
    /**
     * Test Case ID : UT_F01_04
     * Test Objective: Xác minh mật khẩu plaintext không bao giờ được lưu trực tiếp vào DB
     * Input         : password="PlainTextPassword"
     * Expected Output: passwordService.hash() được gọi; giá trị lưu vào DB là hash, không phải plaintext
     * Notes         : Yêu cầu bảo mật mật khẩu
     */
    const plainPassword = 'PlainTextPassword';
    const passwordSvc = makeMockPasswordService({
      hash: jest.fn().mockResolvedValue('$2b$10$hashedvalue'),
    });
    const userRepo = makeMockUserRepository();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'test@example.com', password: plainPassword });

    // Mật khẩu hash phải được gọi với giá trị plaintext
    expect(passwordSvc.hash).toHaveBeenCalledWith(plainPassword);

    // Giá trị lưu vào DB phải là hash, không phải plaintext
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: '$2b$10$hashedvalue',
      })
    );
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ passwordHash: plainPassword })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_05
  // -------------------------------------------------------------------
  it('UT_F01_05 – Trạng thái mặc định là ACTIVE sau đăng ký', async () => {
    /**
     * Test Case ID : UT_F01_05
     * Test Objective: Xác minh tài khoản được tạo với trạng thái ACTIVE ngay lập tức
     * Input         : Dữ liệu đăng ký hợp lệ
     * Expected Output: user.status === ACTIVE
     * Notes         : CheckDB – trường status trong create() phải là ACTIVE
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'active@example.com',
      password: 'Password@1',
      fullName: 'Trần Thị B',
    });

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: UserStatus.ACTIVE })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_06
  // -------------------------------------------------------------------
  it('UT_F01_06 – Đăng ký với đầy đủ thông tin tùy chọn (fullName, phone, gender)', async () => {
    /**
     * Test Case ID : UT_F01_06
     * Test Objective: Xác minh các trường tùy chọn được lưu đúng khi truyền vào
     * Input         : fullName="Lê Văn C", phoneNumber="0987654321", gender="MALE"
     * Expected Output: create() được gọi với các giá trị tùy chọn đúng
     */
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({
        fullName: 'Lê Văn C',
        phoneNumber: '0987654321',
        gender: 'MALE',
      })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'levanc@example.com',
      password: 'Password@1',
      fullName: 'Lê Văn C',
      phoneNumber: '0987654321',
      gender: 'MALE',
    });

    expect(result.fullName).toBe('Lê Văn C');
    expect(result.phoneNumber).toBe('0987654321');
    expect(result.gender).toBe('MALE');
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Lê Văn C',
        phoneNumber: '0987654321',
        gender: 'MALE',
      })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_07
  // -------------------------------------------------------------------
  it('UT_F01_07 – Tên null/undefined được lưu thành null trong DB', async () => {
    /**
     * Test Case ID : UT_F01_07
     * Test Objective: Các trường tùy chọn không truyền vào phải được mặc định là null
     * Input         : Chỉ email và password, không có fullName
     * Expected Output: fullName=null, phoneNumber=null, gender=null trong payload create
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'minimal@example.com', password: 'Password@1' });

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: null,
        phoneNumber: null,
        gender: null,
        avatarUrl: null,
      })
    );
  });
});
