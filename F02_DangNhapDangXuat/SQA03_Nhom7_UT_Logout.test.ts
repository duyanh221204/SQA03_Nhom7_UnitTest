/**
 * @file SQA03_Nhom7_UT_Logout.test.ts
 * @module F02_DangNhapDangXuat
 * @description Unit tests for LogoutUserUseCase – F02: Đăng xuất tài khoản
 * @group Nhom 07 - SQA03
 *
 * Covers:
 *  - Đăng xuất thành công – cập nhật lastLogoutAt
 *  - Đăng xuất thất bại khi userId không tồn tại
 */

// =====================================================================
// INLINE ERRORS
// =====================================================================
class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) { super(message); this.name = 'NotFoundError'; }
}

// =====================================================================
// INLINE USE CASE
// =====================================================================
interface IUserRepository {
  findById(id: string): Promise<any | null>;
  update(id: string, data: Record<string, unknown>): Promise<any>;
}

class LogoutUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await this.userRepository.update(user.id, { lastLogoutAt: new Date() });
  }
}

// =====================================================================
// HELPERS
// =====================================================================
const buildUser = (overrides: any = {}) => ({
  id: 'user-001',
  email: 'user@example.com',
  ...overrides,
});

// =====================================================================
// TEST SUITE
// =====================================================================
describe('F02 - Đăng xuất tài khoản | LogoutUserUseCase', () => {

  it('UT_F02_09 – Đăng xuất thành công, lastLogoutAt được cập nhật', async () => {
    /**
     * Test Case ID : UT_F02_09
     * Test Objective: Xác minh đăng xuất thành công và thời gian đăng xuất được lưu
     * Input         : userId="user-001" (hợp lệ)
     * Expected Output: update() được gọi với { lastLogoutAt: <Date> }
     * Notes         : CheckDB – update() phải được gọi 1 lần với userId đúng
     *                 Rollback – mock; không thay đổi DB thực
     */
    const user = buildUser();
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    await expect(useCase.execute('user-001')).resolves.toBeUndefined();

    // CheckDB: update() phải được gọi với lastLogoutAt là Date
    expect(userRepo.update).toHaveBeenCalledTimes(1);
    expect(userRepo.update).toHaveBeenCalledWith(
      'user-001',
      expect.objectContaining({
        lastLogoutAt: expect.any(Date),
      })
    );
  });

  it('UT_F02_10 – Đăng xuất thất bại khi userId không tồn tại', async () => {
    /**
     * Test Case ID : UT_F02_10
     * Test Objective: Xác minh NotFoundError khi userId không có trong DB
     * Input         : userId="ghost-user" (không tồn tại)
     * Expected Output: Ném NotFoundError
     * Notes         : CheckDB – update() KHÔNG được gọi
     */
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    await expect(useCase.execute('ghost-user')).rejects.toThrow(NotFoundError);
    expect(userRepo.update).not.toHaveBeenCalled();
  });
});
