import { Storage, type Bucket } from '@google-cloud/storage';
import { StorageDriver, contentDisposition, type SignedUpload, type StoredObject } from './storage.js';

/**
 * Google Cloud Storage (staging/production). Credentials come from the Cloud Run service
 * account (Application Default Credentials) — no key files.
 *
 * ⏸ Needs, at deploy time (docs/SETUP-LATER.md): GCS_PROJECT_ID, GCS_PRIVATE_BUCKET, the
 * service account granted roles/storage.objectAdmin on the bucket and
 * roles/iam.serviceAccountTokenCreator on itself (to sign URLs), and a bucket CORS rule allowing
 * PUT from https://*.schoolos.in.
 */
export class GcsStorageDriver extends StorageDriver {
  private readonly gcsBucket: Bucket;

  constructor(
    projectId: string,
    readonly bucket: string,
  ) {
    super();
    this.gcsBucket = new Storage({ projectId }).bucket(bucket);
  }

  async uploadUrl(o: { key: string; contentType: string; maxBytes: number; expiresInSec: number }): Promise<SignedUpload> {
    const expiresAt = new Date(Date.now() + o.expiresInSec * 1000);
    const sizeRange = `0,${o.maxBytes}`;
    const [url] = await this.gcsBucket.file(o.key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: o.contentType,
      extensionHeaders: { 'x-goog-content-length-range': sizeRange },
    });
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': o.contentType, 'x-goog-content-length-range': sizeRange },
      expiresAt,
    };
  }

  async downloadUrl(o: { key: string; fileName: string; contentType: string; expiresInSec: number; inline?: boolean }): Promise<string> {
    const [url] = await this.gcsBucket.file(o.key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + o.expiresInSec * 1000,
      responseDisposition: contentDisposition(o.fileName, o.inline),
      responseType: o.contentType,
    });
    return url;
  }

  async stat(key: string): Promise<StoredObject | null> {
    const file = this.gcsBucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return { size: Number(meta.size ?? 0), contentType: meta.contentType };
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const [buf] = await this.gcsBucket.file(key).download({ start: 0, end: bytes - 1 });
    return buf;
  }

  async delete(key: string): Promise<void> {
    await this.gcsBucket.file(key).delete({ ignoreNotFound: true });
  }
}
