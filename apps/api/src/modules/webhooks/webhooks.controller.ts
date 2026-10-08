import { Controller, Headers, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../core/auth/decorators.js';
import { AppError } from '../../core/errors/app-error.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /** Razorpay calls this; authenticated by the HMAC signature, not a session. */
  @Post('razorpay/:publicId')
  @HttpCode(200)
  @Public()
  async razorpay(
    @Param('publicId') publicId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(publicId) || !req.rawBody) throw AppError.notFound('webhook');
    return { data: await this.webhooks.receive(publicId, req.rawBody, signature, eventId) };
  }
}
