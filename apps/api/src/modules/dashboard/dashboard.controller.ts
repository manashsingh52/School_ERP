import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/decorators.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.view')
  async get() {
    return { data: await this.dashboard.get() };
  }
}
