/**
 * Storage abstraction (Master Prompt §9): business code never calls a cloud SDK directly.
 * Drivers: local disk (development) and Google Cloud Storage (staging/production).
 */
export interface SignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the client must send with the upload (signed into the URL). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  size: number;
  contentType?: string;
}

export abstract class StorageDriver {
  abstract readonly bucket: string;
  abstract uploadUrl(o: { key: string; contentType: string; maxBytes: number; expiresInSec: number }): Promise<SignedUpload>;
  abstract downloadUrl(o: { key: string; fileName: string; contentType: string; expiresInSec: number; inline?: boolean }): Promise<string>;
  abstract stat(key: string): Promise<StoredObject | null>;
  /** First bytes of an object (magic-byte checks). */
  abstract readHead(key: string, bytes: number): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
}

/** RFC 6266 attachment header that is safe for any file name. */
export function contentDisposition(fileName: string, inline = false): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
