import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { errors, importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import { ENV, type Env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

/** Access-token claims (docs/03 §1). `typ: 'user'` = signed in but no school selected yet. */
export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  typ: 'user' | 'school';
  sch?: string; // school id
  mid?: string; // membership id
}

const AUDIENCE = 'schoolos-api';
const decodePem = (value: string) => (value.includes('BEGIN') ? value : Buffer.from(value, 'base64').toString('utf8'));

@Injectable()
export class TokenService implements OnModuleInit {
  private privateKey!: CryptoKey;
  private publicKey!: CryptoKey;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    this.privateKey = await importPKCS8(decodePem(this.env.JWT_PRIVATE_KEY), 'EdDSA');
    this.publicKey = await importSPKI(decodePem(this.env.JWT_PUBLIC_KEY), 'EdDSA');
  }

  async signAccess(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.env.ACCESS_TOKEN_TTL_SECONDS * 1000);
    const { sub, ...rest } = claims;
    const token = await new SignJWT({ ...rest })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.privateKey);
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.env.JWT_ISSUER,
        audience: AUDIENCE,
        algorithms: ['EdDSA'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('bad claims');
      const typ = payload.typ === 'school' ? 'school' : 'user';
      if (typ === 'school' && (typeof payload.sch !== 'string' || typeof payload.mid !== 'string')) {
        throw new Error('bad school claims');
      }
      return {
        sub: payload.sub,
        sid: payload.sid,
        typ,
        sch: payload.sch as string | undefined,
        mid: payload.mid as string | undefined,
      };
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw AppError.unauthenticated('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
      }
      throw AppError.unauthenticated();
    }
  }

  /** Opaque refresh token (256-bit). Only its SHA-256 hash is stored. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokenService.hashRefresh(token) };
  }

  static hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
