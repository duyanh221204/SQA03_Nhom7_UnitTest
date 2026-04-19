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
// IMPORT FROM SOURCE FILE (enables Jest coverage measurement)
// =====================================================================
import {
  UserRole,
  UserStatus,
  ConflictError,
  IUserRepository,
  IPasswordService,
  RegisterUserUseCase,
} from './F01.src';

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

  // -------------------------------------------------------------------
  // Test Case UT_F01_08
  // -------------------------------------------------------------------
  it('UT_F01_08 – Đăng ký thành công với role=RECRUITER được chỉ định tường minh', async () => {
    /**
     * Test Case ID : UT_F01_08
     * Test Objective: Xác minh role tùy chỉnh (RECRUITER) được lưu đúng khi truyền vào
     * Input         : email="recruiter@example.com", role=RECRUITER
     * Expected Output: create() nhận role=RECRUITER
     * Notes         : CheckDB – role phải không bị ghi đè thành CANDIDATE
     */
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({ role: UserRole.RECRUITER })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'recruiter@example.com',
      password: 'Password@1',
      role: UserRole.RECRUITER,
    });

    expect(result.role).toBe(UserRole.RECRUITER);
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.RECRUITER })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_09
  // -------------------------------------------------------------------
  it('UT_F01_09 – findByEmail() được gọi đúng 1 lần với email input', async () => {
    /**
     * Test Case ID : UT_F01_09
     * Test Objective: Xác minh luôn kiểm tra trùng email trước khi tạo tài khoản
     * Input         : email="check@example.com"
     * Expected Output: findByEmail() được gọi đúng 1 lần với email="check@example.com"
     * Notes         : CheckDB – không được bỏ qua bước kiểm tra email
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'check@example.com', password: 'Password@1' });

    expect(userRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(userRepo.findByEmail).toHaveBeenCalledWith('check@example.com');
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_10
  // -------------------------------------------------------------------
  it('UT_F01_10 – dateOfBirth hợp lệ được lưu đúng vào DB', async () => {
    /**
     * Test Case ID : UT_F01_10
     * Test Objective: Xác minh trường dateOfBirth được truyền và lưu đúng
     * Input         : dateOfBirth=new Date('1990-01-15')
     * Expected Output: create() nhận dateOfBirth đúng; result.dateOfBirth khớp
     * Notes         : CheckDB – dateOfBirth phải không bị null khi đã truyền
     */
    const dob = new Date('1990-01-15');
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({ dateOfBirth: dob })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'dob@example.com',
      password: 'Password@1',
      dateOfBirth: dob,
    });

    expect(result.dateOfBirth).toEqual(dob);
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ dateOfBirth: dob })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_11
  // -------------------------------------------------------------------
  it('UT_F01_11 – avatarUrl luôn là null khi đăng ký tài khoản mới', async () => {
    /**
     * Test Case ID : UT_F01_11
     * Test Objective: Xác minh avatarUrl mặc định null tại thời điểm đăng ký
     * Input         : Bất kỳ dữ liệu hợp lệ nào (không truyền avatarUrl)
     * Expected Output: create() nhận avatarUrl=null; result.avatarUrl===null
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({
      email: 'avatar@example.com',
      password: 'Password@1',
    });

    expect(result.avatarUrl).toBeNull();
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: null })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_12
  // -------------------------------------------------------------------
  it('UT_F01_12 – passwordService.hash() KHÔNG được gọi khi email đã tồn tại', async () => {
    /**
     * Test Case ID : UT_F01_12
     * Test Objective: Xác minh không lãng phí tài nguyên hash khi email trùng
     * Input         : email trùng (findByEmail trả về user đã tồn tại)
     * Expected Output: ConflictError; passwordService.hash() KHÔNG được gọi
     * Notes         : Tối ưu hiệu năng – không hash khi đã biết thất bại
     */
    const existingUser = buildUser({ email: 'existing2@example.com' });
    const userRepo = makeMockUserRepository({
      findByEmail: jest.fn().mockResolvedValue(existingUser),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await expect(
      useCase.execute({ email: 'existing2@example.com', password: 'Password@1' })
    ).rejects.toThrow(ConflictError);

    expect(passwordSvc.hash).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_13
  // -------------------------------------------------------------------
  it('UT_F01_13 – Email có chữ hoa được lưu đúng theo giá trị input gốc', async () => {
    /**
     * Test Case ID : UT_F01_13
     * Test Objective: Xác minh email có chữ hoa không bị biến đổi (lowercase) khi lưu
     * Input         : email="User@Example.COM"
     * Expected Output: create() nhận email="User@Example.COM" (không đổi thành chữ thường)
     * Notes         : CheckDB – email được lưu đúng theo giá trị truyền vào
     */
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({ email: 'User@Example.COM' })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'User@Example.COM', password: 'Password@1' });

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'User@Example.COM' })
    );
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_14
  // -------------------------------------------------------------------
  it('UT_F01_14 – Kết quả đăng ký trả về đầy đủ các trường cần thiết (id, email, role, status)', async () => {
    /**
     * Test Case ID : UT_F01_14
     * Test Objective: Xác minh response đăng ký không thiếu trường nào cần thiết
     * Input         : Đăng ký hợp lệ với email và password
     * Expected Output: result có property id, email, role, status, createdAt, updatedAt
     * Notes         : Đảm bảo API trả về đủ dữ liệu cho client hiển thị
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({ email: 'fields@example.com', password: 'Password@1' });

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('updatedAt');
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_15
  // -------------------------------------------------------------------
  it('UT_F01_15 – userRepository.create() chỉ được gọi đúng 1 lần mỗi lượt đăng ký', async () => {
    /**
     * Test Case ID : UT_F01_15
     * Test Objective: Xác minh không có vòng lặp/retry tạo tài khoản không cần thiết
     * Input         : Đăng ký hợp lệ với email mới
     * Expected Output: userRepo.create() được gọi đúng 1 lần (không nhiều hơn)
     * Notes         : Rollback – gọi nhiều lần sẽ tạo nhiều bản ghi trùng lặp trong DB
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'once@example.com', password: 'Password@1' });

    expect(userRepo.create).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_16
  // -------------------------------------------------------------------
  it('UT_F01_16 – createdAt và updatedAt trong kết quả khớp với dữ liệu từ repository', async () => {
    /**
     * Test Case ID : UT_F01_16
     * Test Objective: Xác minh timestamp được lấy từ repository, không phải tạo lại
     * Input         : repository trả về createdAt=2024-06-01, updatedAt=2024-06-01
     * Expected Output: result.createdAt và result.updatedAt đúng bằng giá trị từ repo
     * Notes         : CheckDB – timestamp phải đồng nhất giữa DB và response
     */
    const now = new Date('2024-06-01T00:00:00.000Z');
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({ createdAt: now, updatedAt: now })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({ email: 'time@example.com', password: 'Password@1' });

    expect(result.createdAt).toEqual(now);
    expect(result.updatedAt).toEqual(now);
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_17
  // -------------------------------------------------------------------
  it('UT_F01_17 – passwordService.hash() được gọi đúng 1 lần với password input gốc', async () => {
    /**
     * Test Case ID : UT_F01_17
     * Test Objective: Xác minh hash chỉ thực hiện 1 lần và không bị thay đổi input
     * Input         : password="Password@1"
     * Expected Output: passwordSvc.hash() gọi đúng 1 lần với "Password@1"
     * Notes         : Bảo mật – hash nhiều lần hoặc hash sai input gây lỗi đăng nhập sau này
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'hashcheck@example.com', password: 'Password@1' });

    expect(passwordSvc.hash).toHaveBeenCalledTimes(1);
    expect(passwordSvc.hash).toHaveBeenCalledWith('Password@1');
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_18
  // -------------------------------------------------------------------
  it('UT_F01_18 – fullName mặc định null khi không được cung cấp', async () => {
    /**
     * Test Case ID : UT_F01_18
     * Test Objective: Xác minh fullName không bắt buộc và mặc định là null khi đăng ký
     * Input         : { email: 'nofullname@example.com', password: 'Password@1' } (không có fullName)
     * Expected Output: userRepo.create() được gọi với fullName: null
     * Notes         : CheckDB – trường fullName phải nullable trong DB
     */
    const userRepo = makeMockUserRepository({
      create: jest.fn().mockResolvedValue(buildUser({ fullName: null })),
    });
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({ email: 'nofullname@example.com', password: 'Password@1' });

    expect(result.fullName).toBeNull();
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_19
  // -------------------------------------------------------------------
  it('UT_F01_19 – avatarUrl mặc định null sau khi đăng ký thành công', async () => {
    /**
     * Test Case ID : UT_F01_19
     * Test Objective: Xác minh avatarUrl mặc định null (chưa có ảnh) khi tài khoản mới tạo
     * Input         : Đăng ký hợp lệ không truyền avatarUrl
     * Expected Output: result.avatarUrl === null
     * Notes         : CheckDB – avatarUrl nullable, chưa upload ảnh đại diện lúc đăng ký
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    const result = await useCase.execute({ email: 'noavatar@example.com', password: 'Password@1' });

    expect(result.avatarUrl).toBeNull();
  });

  // -------------------------------------------------------------------
  // Test Case UT_F01_20
  // -------------------------------------------------------------------
  it('UT_F01_20 – userRepository.findByEmail() được gọi đúng với email input gốc', async () => {
    /**
     * Test Case ID : UT_F01_20
     * Test Objective: Xác minh use case kiểm tra email trùng lặp trước khi tạo tài khoản
     * Input         : email="checkdup@example.com"
     * Expected Output: userRepo.findByEmail() được gọi đúng 1 lần với "checkdup@example.com"
     * Notes         : CheckDB – phải query DB để kiểm tra email tồn tại trước khi insert
     */
    const userRepo = makeMockUserRepository();
    const passwordSvc = makeMockPasswordService();
    const useCase = new RegisterUserUseCase(userRepo, passwordSvc);

    await useCase.execute({ email: 'checkdup@example.com', password: 'Password@1' });

    expect(userRepo.findByEmail).toHaveBeenCalledTimes(1);
    expect(userRepo.findByEmail).toHaveBeenCalledWith('checkdup@example.com');
  });
});
