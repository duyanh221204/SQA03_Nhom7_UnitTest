/**
 * @file    CVUseCases.ts
 * @module  src/F07
 * @desc    Source file cho F07 – Quản lý CV.
 *          File này chứa logic nghiệp vụ được trích từ source code gốc
 *          BE-Jobs-connect để phục vụ đo code coverage.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────
export enum UserRole { CANDIDATE = 'CANDIDATE', RECRUITER = 'RECRUITER', ADMIN = 'ADMIN' }

// ─── Errors ──────────────────────────────────────────────────────────────────
export class AppError extends Error { constructor(msg: string, public statusCode = 500) { super(msg); } }
export class NotFoundError    extends AppError { constructor(m: string) { super(m, 404); this.name = 'NotFoundError'; } }
export class ValidationError  extends AppError { constructor(m: string) { super(m, 400); this.name = 'ValidationError'; } }
export class AuthorizationError extends AppError { constructor(m: string) { super(m, 403); this.name = 'AuthorizationError'; } }
export class ConflictError    extends AppError { constructor(m: string) { super(m, 409); this.name = 'ConflictError'; } }

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface ICVRepository {
  save(data: any): Promise<any>;
  findById(id: string): Promise<any | null>;
  findByIdWithRelations(id: string): Promise<any | null>;
  countByUserId(userId: string): Promise<number>;
  unsetMainForUser(userId: string): Promise<void>;
  findByUserId(userId: string): Promise<any[]>;
  update(id: string, data: any): Promise<any>;
  delete(id: string): Promise<void>;
  hasApplications(id: string): Promise<boolean>;
}
export interface IUserRepository { findById(id: string): Promise<any | null>; }
export interface ICVTemplateRepository { findById(id: string): Promise<any | null>; }
export interface IFileStorageService {
  uploadFile(file: any, folder: string, filename?: string): Promise<string>;
}
export interface IPDFService {
  renderTemplate(html: string, data: any): string;
  generatePDF(html: string): Promise<Buffer>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── A. CreateCVUseCase ───────────────────────────────────────────────────────
export interface CreateCVInput {
  userId: string; title: string; email?: string; isMain?: boolean;
  templateId?: string; fullName?: string; phoneNumber?: string;
  skills?: any[]; educations?: any[]; workExperiences?: any[];
  certifications?: any[]; summary?: string; objective?: string;
  isOpenForJob?: boolean;
}
export class CreateCVUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private userRepo: IUserRepository,
    private tplRepo: ICVTemplateRepository,
    private fileSvc: IFileStorageService,
    private pdfSvc: IPDFService,
  ) {}
  async execute(input: CreateCVInput) {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError('User not found');
    if (input.email && !isValidEmail(input.email)) throw new ValidationError('Invalid email format');
    if (input.templateId) {
      const tpl = await this.tplRepo.findById(input.templateId);
      if (!tpl) throw new NotFoundError('CV Template not found');
      if (!tpl.isActive) throw new ValidationError('CV Template is not active');
    }
    const count = await this.cvRepo.countByUserId(input.userId);
    const isFirst = count === 0;
    if (input.isMain || isFirst) await this.cvRepo.unsetMainForUser(input.userId);
    const cv = await this.cvRepo.save({
      userId: input.userId, title: input.title,
      templateId: input.templateId ?? null, email: input.email ?? null,
      isMain: input.isMain ?? isFirst,
      fullName: input.fullName ?? null, phoneNumber: input.phoneNumber ?? null,
      skills: input.skills ?? [], educations: input.educations ?? [],
      workExperiences: input.workExperiences ?? [], certifications: input.certifications ?? [],
      summary: input.summary ?? null, objective: input.objective ?? null,
      isOpenForJob: input.isOpenForJob ?? false,
    });
    if (input.templateId) {
      try {
        const tpl = await this.tplRepo.findById(input.templateId);
        if (tpl?.isActive) {
          const html = this.pdfSvc.renderTemplate('<html/>', {});
          const buf = await this.pdfSvc.generatePDF(html);
          const url = await this.fileSvc.uploadFile({ buffer: buf }, 'cv-exports');
          await this.cvRepo.update(cv.id, { pdfUrl: url });
        }
      } catch (_) { /* lỗi PDF không được phép làm thất bại tạo CV */ }
    }
    return await this.cvRepo.findByIdWithRelations(cv.id);
  }
}

// ─── B. GetCVsByUserUseCase ───────────────────────────────────────────────────
export class GetCVsByUserUseCase {
  constructor(private cvRepo: ICVRepository, private userRepo: IUserRepository) {}
  async execute(input: { userId: string; targetUserId: string; userRole: string }) {
    const target = await this.userRepo.findById(input.targetUserId);
    if (!target) throw new NotFoundError('Không tìm thấy người dùng');
    const isOwner     = input.userId === input.targetUserId;
    const isAdmin     = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;
    if (!isOwner && !isAdmin && !isRecruiter)
      throw new AuthorizationError('Bạn không có quyền xem các CV này');
    const cvs = await this.cvRepo.findByUserId(input.targetUserId);
    return { cvs };
  }
}

// ─── C. GetCVByIdUseCase ──────────────────────────────────────────────────────
export class GetCVByIdUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const cv = await this.cvRepo.findByIdWithRelations(input.cvId);
    if (!cv) throw new NotFoundError('Không tìm thấy CV');
    const isOwner     = input.userId === cv.userId;
    const isAdmin     = input.userRole === UserRole.ADMIN;
    const isRecruiter = input.userRole === UserRole.RECRUITER;
    if (isOwner || isAdmin) return cv;
    if (isRecruiter) {
      if (!cv.isOpenForJob) throw new AuthorizationError('CV này không công khai');
      return cv;
    }
    throw new AuthorizationError('Bạn không có quyền xem CV này');
  }
}

// ─── D. UpdateCVUseCase ───────────────────────────────────────────────────────
export class UpdateCVUseCase {
  constructor(
    private cvRepo: ICVRepository,
    private tplRepo: ICVTemplateRepository,
    private fileSvc: IFileStorageService,
    private pdfSvc: IPDFService,
  ) {}
  async execute(input: {
    cvId: string; userId: string; userRole: string;
    title?: string; email?: string; isMain?: boolean; templateId?: string;
    fullName?: string; phoneNumber?: string; summary?: string;
    skills?: any[]; workExperiences?: any[]; educations?: any[];
  }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền cập nhật CV này');
    if (input.email && !isValidEmail(input.email)) throw new ValidationError('Định dạng email không hợp lệ');
    if (input.templateId) {
      const tpl = await this.tplRepo.findById(input.templateId);
      if (!tpl) throw new NotFoundError('Không tìm thấy mẫu CV');
      if (!tpl.isActive) throw new ValidationError('Mẫu CV không còn hoạt động');
    }
    if (input.isMain && !existing.isMain) await this.cvRepo.unsetMainForUser(existing.userId);
    const updateData: any = {};
    if (input.title       !== undefined) updateData.title       = input.title;
    if (input.email       !== undefined) updateData.email       = input.email;
    if (input.isMain      !== undefined) updateData.isMain      = input.isMain;
    if (input.fullName    !== undefined) updateData.fullName    = input.fullName;
    if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
    if (input.summary     !== undefined) updateData.summary     = input.summary;
    if (input.skills      !== undefined) updateData.skills      = input.skills;
    if (input.workExperiences !== undefined) updateData.workExperiences = input.workExperiences;
    if (input.educations  !== undefined) updateData.educations  = input.educations;
    if (input.templateId  !== undefined) updateData.templateId  = input.templateId;
    await this.cvRepo.update(input.cvId, updateData);
    const updated = await this.cvRepo.findByIdWithRelations(input.cvId);
    const finalTplId = input.templateId !== undefined ? input.templateId : existing.templateId;
    const hasContent = Object.keys(updateData).some(k => k !== 'isMain' && k !== 'isOpenForJob');
    if (hasContent && finalTplId) {
      try {
        const tpl = await this.tplRepo.findById(finalTplId);
        if (tpl?.isActive) {
          const html = this.pdfSvc.renderTemplate('<html/>', {});
          const buf  = await this.pdfSvc.generatePDF(html);
          const url  = await this.fileSvc.uploadFile({ buffer: buf }, 'cv-exports');
          await this.cvRepo.update(input.cvId, { pdfUrl: url });
        }
      } catch (_) { /* intentional */ }
    }
    return await this.cvRepo.findByIdWithRelations(input.cvId);
  }
}

// ─── E. DeleteCVUseCase ───────────────────────────────────────────────────────
export class DeleteCVUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền xóa CV này');
    const hasApps = await this.cvRepo.hasApplications(input.cvId);
    if (hasApps) throw new ConflictError('Không thể xóa CV đã có đơn ứng tuyển');
    if (existing.isMain) {
      const all = await this.cvRepo.findByUserId(existing.userId);
      const rest = all.filter((c: any) => c.id !== input.cvId);
      if (rest.length > 0) {
        const oldest = rest.sort((a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        await this.cvRepo.update(oldest.id, { isMain: true });
      }
    }
    await this.cvRepo.delete(input.cvId);
    return { success: true, message: 'Xóa CV thành công' };
  }
}

// ─── F. SetMainCVUseCase ──────────────────────────────────────────────────────
export class SetMainCVUseCase {
  constructor(private cvRepo: ICVRepository) {}
  async execute(input: { cvId: string; userId: string; userRole: string }) {
    const existing = await this.cvRepo.findById(input.cvId);
    if (!existing) throw new NotFoundError('Không tìm thấy CV');
    const isOwner = input.userId === existing.userId;
    const isAdmin = input.userRole === UserRole.ADMIN;
    if (!isOwner && !isAdmin) throw new AuthorizationError('Bạn không có quyền cập nhật CV này');
    await this.cvRepo.unsetMainForUser(existing.userId);
    await this.cvRepo.update(input.cvId, { isMain: true });
    return await this.cvRepo.findByIdWithRelations(input.cvId);
  }
}
