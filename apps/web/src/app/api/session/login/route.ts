import type { NextRequest } from 'next/server';
import { signIn } from '@/lib/session-login';

export function POST(req: NextRequest) {
  return signIn(req, '/v1/auth/login');
}
