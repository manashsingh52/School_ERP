import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AppError } from '../errors/app-error.js';
import { StorageDriver, type SignedUpload, type StoredObject } from './storage.js';

interface LocalToken {
  k: string; // object key
  a: 'put' | 'get';
  e: number; // expiry, epoch ms
  ct: string; // content type
  max?: number; // upload size cap
  fn?: string; // download file name
  in?: boolean; // inline
}

/**
 * Development storage on local disk. Mimics signed URLs: the link carries an HMAC-signed token
 * (key, action, expiry, size cap) served by LocalStorageController. Never used in production.
 */
export class LocalStorageDriver extends StorageDriver {
  readonly bucket = 'local';
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly secret: string,
    private readonly urlBase: string,
  ) {
    super();
    this.root = resolve(rootDir);
  }

  async uploadUrl(o: { key: string; contentType: string; maxBytes: number; expiresInSec: number }): Promise<SignedUpload> {
    const expiresAt = new Date(Date.now() + o.expiresInSec * 1000);
    const token = this.sign({ k: o.key, a: 'put', e: expiresAt.getTime(), ct: o.contentType, max: o.maxBytes });
    return { url: `${this.urlBase}/v1/files/local/${token}`, method: 'PUT', headers: { 'content-type': o.contentType }, expiresAt };
  }

  async downloadUrl(o: { key: string; fileName: string; contentType: string; expiresInSec: number; inline?: boolean }): Promise<string> {
    const token = this.sign({ k: o.key, a: 'get', e: Date.now() + o.expiresInSec * 1000, ct: o.contentType, fn: o.fileName, in: o.inline });
    return `${this.urlBase}/v1/files/local/${token}`;
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      return { size: (await stat(this.path(key))).size };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const handle = await open(this.path(key), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  // ---------------------------------------------------------------- used by LocalStorageController

  verify(token: string, action: 'put' | 'get'): LocalToken {
    const [body, mac] = token.split('.');
    if (!body || !mac) throw AppError.notFound('file');
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw AppError.notFound('file');
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalToken;
    if (parsed.a !== action) throw AppError.notFound('file');
    if (parsed.e < Date.now()) throw new AppError('LINK_EXPIRED', 410, 'This link has expired. Please try again.');
    return parsed;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  path(key: string): string {
    const file = resolve(this.root, key);
    if (!file.startsWith(this.root + sep)) throw AppError.notFound('file'); // no path traversal
    return file;
  }

  private sign(token: LocalToken): string {
    const body = Buffer.from(JSON.stringify(token)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
