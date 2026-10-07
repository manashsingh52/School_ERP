import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly platform: PlatformPrismaService) {}

  @Get()
  @Public()
  async check() {
    await this.platform.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
