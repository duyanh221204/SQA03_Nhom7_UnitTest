/**
 * Factory helpers for CV Template module unit tests.
 * Keeps test data consistent and readable across spec files.
 */

import { CVTemplate } from '../../../src/modules/cv/domain/entities/CVTemplate';
import type { TemplateFileInput } from '../../../src/modules/cv/application/dtos/CVTemplateDTO';

const fixedDate = new Date('2026-01-15T10:00:00.000Z');

/**
 * Builds a persisted-like domain CVTemplate for assertions and repository mocks.
 */
export function buildCvTemplateDomain(overrides: Partial<ConstructorParameters<typeof CVTemplate>[0]> = {}): CVTemplate {
  return new CVTemplate({
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Mẫu test',
    htmlUrl: 'https://example.com/template.html',
    previewUrl: 'https://example.com/preview.png',
    isActive: true,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  });
}

/**
 * Minimal valid HTML file payload (in-memory) for upload-related tests.
 */
export function buildValidHtmlTemplateFile(): TemplateFileInput {
  return {
    buffer: Buffer.from('<html><body>CV</body></html>', 'utf-8'),
    originalname: 'cv.html',
    mimetype: 'text/html',
    size: 64,
  };
}

/**
 * Minimal valid image file payload for preview upload tests.
 */
export function buildValidPreviewImageFile(): TemplateFileInput {
  return {
    buffer: Buffer.from('fake-png-bytes'),
    originalname: 'preview.png',
    mimetype: 'image/png',
    size: 32,
  };
}
