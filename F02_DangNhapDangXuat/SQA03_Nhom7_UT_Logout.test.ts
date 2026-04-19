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
// IMPORT FROM SOURCE FILE (enables Jest coverage measurement)
// =====================================================================
import {
  NotFoundError,
  ILogoutUserRepository as IUserRepository,
  LogoutUserUseCase,
} from './F02.src';

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

  it('UT_F02_15 – findById() được gọi đúng 1 lần với userId trước khi update()', async () => {
    /**
     * Test Case ID : UT_F02_15
     * Test Objective: Xác minh luôn xác thực user tồn tại trước khi cập nhật lastLogoutAt
     * Input         : userId="user-001" hợp lệ
     * Expected Output: findById() được gọi đúng 1 lần với "user-001"
     * Notes         : CheckDB – thứ tự: findById() trước, update() sau
     */
    const user = buildUser();
    const callOrder: string[] = [];
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockImplementation(async () => { callOrder.push('findById'); return user; }),
      update:   jest.fn().mockImplementation(async () => { callOrder.push('update');   return user; }),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    await useCase.execute('user-001');

    expect(userRepo.findById).toHaveBeenCalledTimes(1);
    expect(userRepo.findById).toHaveBeenCalledWith('user-001');
    expect(callOrder).toEqual(['findById', 'update']); // thứ tự phải đúng
  });

  it('UT_F02_16 – lastLogoutAt là thời điểm hiện tại (gần với Date.now())', async () => {
    /**
     * Test Case ID : UT_F02_16
     * Test Objective: Xác minh thời điểm logout được ghi lại đúng, không phải giá trị cũ
     * Input         : userId="user-001" hợp lệ
     * Expected Output: update() nhận lastLogoutAt là Date trong vòng 5 giây tính từ lúc gọi
     */
    const user = buildUser();
    let capturedDate: Date | undefined;
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockImplementation(async (_id, data) => {
        capturedDate = data.lastLogoutAt as Date;
        return user;
      }),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    const before = Date.now();
    await useCase.execute('user-001');
    const after = Date.now();

    expect(capturedDate).toBeInstanceOf(Date);
    expect(capturedDate!.getTime()).toBeGreaterThanOrEqual(before);
    expect(capturedDate!.getTime()).toBeLessThanOrEqual(after + 100);
  });

  it('UT_F02_21 – userRepository.update() chỉ được gọi đúng 1 lần khi đăng xuất thành công', async () => {
    /**
     * Test Case ID : UT_F02_21
     * Test Objective: Xác minh không có vòng lặp/retry cập nhật DB không cần thiết
     * Input         : userId="user-001" hợp lệ
     * Expected Output: userRepo.update() được gọi đúng 1 lần
     * Notes         : Rollback – gọi nhiều lần có thể gây cập nhật sai lastLogoutAt
     */
    const user = buildUser();
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    await useCase.execute('user-001');

    expect(userRepo.update).toHaveBeenCalledTimes(1);
  });

  it('UT_F02_22 – execute() trả về undefined (void) khi đăng xuất thành công', async () => {
    /**
     * Test Case ID : UT_F02_22
     * Test Objective: Xác minh kiểu trả về đúng (void) để API layer không cần xử lý body
     * Input         : userId="user-001" hợp lệ
     * Expected Output: kết quả của execute() là undefined (không ném lỗi)
     * Notes         : API nên trả về 204 No Content; body không cần thiết
     */
    const user = buildUser();
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    };
    const useCase = new LogoutUserUseCase(userRepo);

    const result = await useCase.execute('user-001');

    expect(result).toBeUndefined();
  });
});
