import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { SETTINGS_SECTIONS, settingsSectionSchema, type SchoolSettingsView, type SettingsSection } from '@schoolos/contracts';
import { RequirePermission, SchoolMember } from '../../core/auth/decorators.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { FilesService } from '../files/files.service.js';

/** Settings → General, Fees, Examinations, Branding (docs/12 Phase 6). */
@Controller('school/settings')
export class SchoolSettingsController {
  constructor(
    private readonly settings: SchoolSettingsService,
    private readonly files: FilesService,
  ) {}

  private async view(): Promise<SchoolSettingsView> {
    const all = await this.settings.all();
    return { ...all, branding: { ...all.branding, signatureUrl: all.branding.signatureFileId ? await this.files.inlineUrl(all.branding.signatureFileId) : null } };
  }

  @Get()
  @RequirePermission('school.settings.view')
  async get() {
    return { data: await this.view() };
  }

  /** Branding needs school.branding.manage; every other section school.settings.manage. */
  @Put(':section')
  @SchoolMember()
  async update(@Param('section', new ZodPipe(settingsSectionSchema)) section: SettingsSection, @Body() body: unknown) {
    const needed = section === 'branding' ? 'school.branding.manage' : 'school.settings.manage';
    if (!RequestContextStore.tenant().permissions[needed]) throw AppError.forbidden();
    const input = new ZodPipe(SETTINGS_SECTIONS[section]).transform(body) as never;
    if (section === 'branding') {
      const fileId = (input as { signatureFileId: string | null }).signatureFileId;
      if (fileId) await this.files.assertAllReady([fileId], 'signature', 'signatureFileId');
    }
    await this.settings.update(section, input);
    return { data: await this.view() };
  }
}
