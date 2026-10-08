import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import type { Logger } from 'pino';
import type { z } from 'zod';
import {
  FILE_PURPOSES,
  type DownloadLink,
  type FileInfo,
  type FilePurpose,
  type FilePurposeRule,
  type requestUploadSchema,
  type UploadTicket,
} from '@schoolos/contracts';
import { EntitlementsService } from '../../core/entitlements/entitlements.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { StorageDriver } from '../../core/storage/storage.js';
import type { File as FileRow } from '../../generated/prisma/client.js';

const UPLOAD_TTL_SEC = 10 * 60; // docs/09 §3: PUT links live 10 minutes
const DOWNLOAD_TTL_SEC = 5 * 60; // GET links live 5 minutes
const SNIFF_BYTES = 4100;

/** Object keys: schools/{schoolId}/{purpose}/{fileId} — the purpose is recoverable from the key. */
const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const keyFor = (schoolId: string, purpose: FilePurpose, id: string) => `schools/${schoolId}/${purpose}/${id}`;
export const purposeOf = (objectKey: string): FilePurpose | null => {
  const purpose = objectKey.split('/')[2];
  return purpose && purpose in FILE_PURPOSES ? (purpose as FilePurpose) : null;
};

/**
 * Upload pipeline (docs/09 §3): ask for a signed PUT link → client uploads straight to storage
 * → complete() checks size and REAL type (magic bytes, not the file name) → READY.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly entitlements: EntitlementsService,
  ) {}

  async requestUpload(input: z.output<typeof requestUploadSchema>): Promise<UploadTicket> {
    const rule = this.allowed(input.purpose);
    const ctx = RequestContextStore.tenant();
    await this.entitlements.assertStorage(input.sizeBytes);
    const id = randomUUID();
    const objectKey = keyFor(ctx.schoolId, input.purpose, id);

    await this.prisma.db.file.create({
      data: {
        id,
        bucket: this.storage.bucket,
        objectKey,
        originalName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'PENDING_UPLOAD',
        uploadedByMemberId: ctx.membershipId,
      } as never,
    });
    const upload = await this.storage.uploadUrl({
      key: objectKey,
      contentType: input.mimeType,
      maxBytes: rule.maxBytes,
      expiresInSec: UPLOAD_TTL_SEC,
    });
    return { fileId: id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
  }

  async complete(id: string): Promise<FileInfo> {
    const ctx = RequestContextStore.tenant();
    const file = await this.prisma.db.file.findUnique({ where: { id } });
    // Only the uploader finishes their own upload; anyone else gets "not found".
    if (!file || file.uploadedByMemberId !== ctx.membershipId) throw AppError.notFound('file');
    if (file.status === 'READY') return toInfo(file);
    if (file.status !== 'PENDING_UPLOAD') throw new AppError('FILE_REJECTED', 422, 'This upload was rejected. Please upload the file again.');

    const purpose = purposeOf(file.objectKey);
    const rule: FilePurposeRule | undefined = purpose ? FILE_PURPOSES[purpose] : undefined;
    const stored = await this.storage.stat(file.objectKey);
    if (!rule || !stored) throw new AppError('UPLOAD_MISSING', 422, "We didn't receive the file. Please upload it again.");

    const problem = stored.size === 0
      ? 'The file is empty.'
      : stored.size > rule.maxBytes
        ? `Files must be ${Math.round(rule.maxBytes / 1024 / 1024)} MB or smaller.`
        : await this.typeProblem(file, rule);

    if (problem) {
      await this.storage.delete(file.objectKey);
      await this.prisma.db.file.update({ where: { id }, data: { status: 'REJECTED' } });
      this.logger.warn({ fileId: id, purpose, reason: problem }, 'upload rejected');
      throw new AppError('FILE_REJECTED', 422, problem);
    }

    const ready = await this.prisma.db.file.update({
      where: { id },
      data: { status: 'READY', sizeBytes: BigInt(stored.size) },
    });
    return toInfo(ready);
  }

  async downloadLink(id: string): Promise<DownloadLink> {
    const ctx = RequestContextStore.tenant();
    const file = await this.prisma.db.file.findUnique({ where: { id } });
    if (!file || file.status !== 'READY') throw AppError.notFound('file');
    const purpose = purposeOf(file.objectKey);
    const mayView = file.uploadedByMemberId === ctx.membershipId || (purpose && ctx.permissions[FILE_PURPOSES[purpose].permission]);
    if (!mayView) throw AppError.notFound('file');

    const url = await this.storage.downloadUrl({
      key: file.objectKey,
      fileName: file.originalName,
      contentType: file.mimeType,
      expiresInSec: DOWNLOAD_TTL_SEC,
    });
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString() };
  }

  /**
   * Signed inline link for an image the caller is already allowed to see through its owner
   * (e.g. a student photo on a profile they can view). 1-hour link so pages can cache it.
   */
  async inlineUrl(fileId: string): Promise<string | null> {
    const file = await this.prisma.db.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'READY') return null;
    return this.storage.downloadUrl({
      key: file.objectKey,
      fileName: file.originalName,
      contentType: file.mimeType,
      expiresInSec: 3600,
      inline: true,
    });
  }

  /**
   * Download link for a file the caller may see through the record it is attached to
   * (e.g. a homework attachment on homework they can view). The caller checks that access.
   */
  async attachedLink(fileId: string): Promise<DownloadLink> {
    const file = await this.prisma.db.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'READY') throw AppError.notFound('file');
    const url = await this.storage.downloadUrl({ key: file.objectKey, fileName: file.originalName, contentType: file.mimeType, expiresInSec: DOWNLOAD_TTL_SEC });
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString() };
  }

  /** Store a file the server produced (report card, receipt). Returns the file id. */
  async storeGenerated(o: { purpose: FilePurpose; fileName: string; mimeType: string; data: Buffer; memberId: string }): Promise<string> {
    const { schoolId } = RequestContextStore.school();
    const id = randomUUID();
    const objectKey = keyFor(schoolId, o.purpose, id);
    await this.storage.write(objectKey, o.data, o.mimeType);
    await this.prisma.tenantTx((tx) =>
      tx.file.create({
        data: { id, bucket: this.storage.bucket, objectKey, originalName: o.fileName, mimeType: o.mimeType, sizeBytes: BigInt(o.data.length), status: 'READY', uploadedByMemberId: o.memberId } as never,
      }),
    );
    return id;
  }

  /**
   * A small stored image as a data: URI for server-rendered PDFs (logo, signature, photo).
   * Only PNG/JPEG/WebP up to 2 MB; anything else — or a missing file — gives null, never an error.
   */
  async imageDataUri(fileId: string | null | undefined): Promise<string | null> {
    if (!fileId) return null;
    const file = await this.prisma.db.file.findUnique({ where: { id: fileId }, select: { mimeType: true, sizeBytes: true, status: true } });
    if (!file || file.status !== 'READY' || !INLINE_IMAGE_TYPES.has(file.mimeType) || Number(file.sizeBytes) > 2 * 1024 * 1024) return null;
    try {
      return `data:${file.mimeType};base64,${(await this.bytes(fileId)).toString('base64')}`;
    } catch {
      return null;
    }
  }

  /** Raw bytes of a stored file (e.g. merging report cards). */
  async bytes(fileId: string): Promise<Buffer> {
    const file = await this.prisma.db.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'READY') throw AppError.notFound('file');
    return this.storage.read(file.objectKey);
  }

  /** Every id must be a verified upload of this purpose in this school (for attachments). */
  async assertAllReady(fileIds: string[], purpose: FilePurpose, field: string): Promise<FileRow[]> {
    if (!fileIds.length) return [];
    const files = await this.prisma.db.file.findMany({ where: { id: { in: fileIds }, status: 'READY' } });
    if (files.length !== new Set(fileIds).size || files.some((f) => purposeOf(f.objectKey) !== purpose)) {
      throw AppError.invalidReference(field, 'attachment');
    }
    return files;
  }

  /** A file attached to a record must be a verified upload of the right purpose in this school. */
  async assertReady(fileId: string, purpose: FilePurpose): Promise<void> {
    const file = await this.prisma.db.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'READY' || purposeOf(file.objectKey) !== purpose) {
      throw AppError.invalidReference('photoFileId', 'photo');
    }
  }

  private allowed(purpose: FilePurpose): FilePurposeRule {
    const rule: FilePurposeRule = FILE_PURPOSES[purpose];
    if (!RequestContextStore.tenant().permissions[rule.permission]) throw AppError.forbidden();
    return rule;
  }

  /** Real type from the first bytes. Binary formats must match what was declared. */
  private async typeProblem(file: FileRow, rule: FilePurposeRule): Promise<string | null> {
    const head = await this.storage.readHead(file.objectKey, SNIFF_BYTES);
    const detected = await fileTypeFromBuffer(head);
    if (file.mimeType === 'text/csv') {
      return detected || head.includes(0) ? "This doesn't look like a CSV file." : null;
    }
    if (!detected || !rule.mimeTypes.includes(detected.mime) || detected.mime !== file.mimeType) {
      return "This file's contents don't match its type. Please upload the original file.";
    }
    return null;
  }
}

export function toInfo(file: FileRow): FileInfo {
  return {
    id: file.id,
    purpose: purposeOf(file.objectKey),
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    status: file.status,
    createdAt: file.createdAt.toISOString(),
  };
}
