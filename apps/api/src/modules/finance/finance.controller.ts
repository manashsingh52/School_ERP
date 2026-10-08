import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ENV, type Env } from '../../config/env.js';
import type { z } from 'zod';
import {
  adjustInvoiceSchema,
  applyCreditSchema,
  cancelInvoiceSchema,
  collectPaymentSchema,
  financeReportQuerySchema,
  createOnlineOrderSchema,
  gatewayAccountSchema,
  mockCheckoutSchema,
  refundPaymentSchema,
  verifyOnlinePaymentSchema,
  generateInvoicesSchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
  uuidSchema,
  voidPaymentSchema,
} from '@schoolos/contracts';
import { z as zod } from 'zod';
import { RequirePermission } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { FinanceJobsService } from './finance-jobs.service.js';
import { FinanceReportsService, reportCsv } from './finance-reports.service.js';
import { GatewayService } from './gateway.service.js';
import { InvoicesService } from './invoices.service.js';
import { OnlinePaymentsService } from './online-payments.service.js';
import { PaymentsService } from './payments.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;
const dayQuery = zod.object({ date: zod.iso.date().optional() });
const modeBody = zod.object({ mode: zod.enum(['TEST', 'LIVE']) });
const runJobBody = zod.object({ job: zod.enum(['late-fees', 'fee-reminders']), date: zod.iso.date().optional() });

@Controller('finance/reports')
export class FinanceReportsController {
  constructor(private readonly reports: FinanceReportsService) {}

  @Get()
  @RequirePermission('report.finance')
  async report(@Query(new ZodPipe(financeReportQuerySchema)) query: Out<typeof financeReportQuerySchema>, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.run(query.report, query);
    if (query.format !== 'csv') return { data: report };
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${query.report}-${report.range?.from ?? ''}${report.range ? `-to-${report.range.to}` : ''}.csv"`);
    return reportCsv(report);
  }
}

@Controller('finance/jobs')
export class FinanceJobsController {
  constructor(
    private readonly jobs: FinanceJobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** "Run now" for scheduled finance jobs. `date` (pretend today) only outside production. */
  @Post('run')
  @HttpCode(200)
  @RequirePermission('fee.manage')
  async run(@Body(new ZodPipe(runJobBody)) body: { job: 'late-fees' | 'fee-reminders'; date?: string }) {
    const date = this.env.NODE_ENV === 'production' ? undefined : body.date;
    return { data: body.job === 'late-fees' ? await this.jobs.lateFees(date) : await this.jobs.reminders(date) };
  }
}
const activateBody = modeBody.extend({ active: zod.boolean() });

@Controller('payments/gateway')
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Get()
  @RequirePermission('gateway.manage')
  async status() {
    return { data: await this.gateway.status() };
  }

  @Put()
  @RequirePermission('gateway.manage')
  async connect(@Body(new ZodPipe(gatewayAccountSchema)) body: Out<typeof gatewayAccountSchema>) {
    return { data: await this.gateway.connect(body) };
  }

  @Post('activate')
  @HttpCode(200)
  @RequirePermission('gateway.manage')
  async activate(@Body(new ZodPipe(activateBody)) body: { mode: 'TEST' | 'LIVE'; active: boolean }) {
    return { data: await this.gateway.activate(body.mode, body.active) };
  }

  @Post('test-webhook')
  @HttpCode(200)
  @RequirePermission('gateway.manage')
  async testWebhook(@Body(new ZodPipe(modeBody)) body: { mode: 'TEST' | 'LIVE' }) {
    return { data: await this.gateway.sendTestWebhook(body.mode) };
  }
}

@Controller('payments/online')
export class OnlinePaymentsController {
  constructor(private readonly online: OnlinePaymentsService) {}

  @Post('orders')
  @RequirePermission('payment.pay_online')
  @Idempotent({ required: true })
  async order(@Body(new ZodPipe(createOnlineOrderSchema)) body: Out<typeof createOnlineOrderSchema>) {
    return { data: await this.online.createOrder(body.studentId, body.invoiceIds) };
  }

  @Post('verify')
  @HttpCode(200)
  @RequirePermission('payment.pay_online')
  async verify(@Body(new ZodPipe(verifyOnlinePaymentSchema)) body: Out<typeof verifyOnlinePaymentSchema>) {
    return { data: await this.online.verify(body) };
  }

  @Post('mock-checkout')
  @HttpCode(200)
  @RequirePermission('payment.pay_online')
  async mockCheckout(@Body(new ZodPipe(mockCheckoutSchema)) body: Out<typeof mockCheckoutSchema>) {
    return { data: await this.online.mockCheckout(body) };
  }

  @Post('reconcile')
  @HttpCode(200)
  @RequirePermission('gateway.manage')
  async reconcile() {
    return { data: await this.online.reconcile() };
  }
}

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('invoice.generate')
  async preview(@Body(new ZodPipe(generateInvoicesSchema)) body: Out<typeof generateInvoicesSchema>) {
    return { data: await this.invoices.preview(body.installmentId, body.classIds) };
  }

  @Post('generate')
  @HttpCode(202)
  @RequirePermission('invoice.generate')
  @Idempotent({ required: false })
  async generate(@Body(new ZodPipe(generateInvoicesSchema)) body: Out<typeof generateInvoicesSchema>) {
    return { data: await this.invoices.generate(body.installmentId, body.classIds) };
  }

  @Get()
  @RequirePermission('invoice.view')
  list(@Query(new ZodPipe(listInvoicesQuerySchema)) query: Out<typeof listInvoicesQuerySchema>) {
    return this.invoices.list(query);
  }

  @Get(':id')
  @RequirePermission('invoice.view')
  async get(@Param('id', id) invoiceId: string) {
    return { data: await this.invoices.get(invoiceId) };
  }

  @Post(':id/adjustments')
  @RequirePermission('invoice.adjust')
  @Idempotent({ required: false })
  async adjust(@Param('id', id) invoiceId: string, @Body(new ZodPipe(adjustInvoiceSchema)) body: Out<typeof adjustInvoiceSchema>) {
    return { data: await this.invoices.adjust(invoiceId, body) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('invoice.cancel')
  async cancel(@Param('id', id) invoiceId: string, @Body(new ZodPipe(cancelInvoiceSchema)) body: Out<typeof cancelInvoiceSchema>) {
    return { data: await this.invoices.cancel(invoiceId, body) };
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly online: OnlinePaymentsService,
  ) {}

  @Post(':id/refunds')
  @RequirePermission('payment.refund')
  @Idempotent({ required: true })
  async refund(@Param('id', id) paymentId: string, @Body(new ZodPipe(refundPaymentSchema)) body: Out<typeof refundPaymentSchema>) {
    return { data: await this.online.refund(paymentId, body.amountPaise, body.reason) };
  }

  @Post('collect')
  @RequirePermission('payment.collect')
  @Idempotent({ required: true })
  async collect(@Body(new ZodPipe(collectPaymentSchema)) body: Out<typeof collectPaymentSchema>) {
    return { data: await this.payments.collect(body) };
  }

  @Get()
  @RequirePermission('payment.view')
  list(@Query(new ZodPipe(listPaymentsQuerySchema)) query: Out<typeof listPaymentsQuerySchema>) {
    return this.payments.list(query);
  }

  @Get('day-close')
  @RequirePermission('payment.collect')
  async dayClose(@Query(new ZodPipe(dayQuery)) query: { date?: string }) {
    return { data: await this.payments.dayClose(query.date) };
  }

  @Get(':id')
  @RequirePermission('payment.view')
  async get(@Param('id', id) paymentId: string) {
    return { data: await this.payments.get(paymentId) };
  }

  @Get(':id/receipt')
  @RequirePermission('payment.view')
  async receipt(@Param('id', id) paymentId: string) {
    return { data: await this.payments.receiptLink(paymentId) };
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission('payment.void')
  async void(@Param('id', id) paymentId: string, @Body(new ZodPipe(voidPaymentSchema)) body: Out<typeof voidPaymentSchema>) {
    return { data: await this.payments.void(paymentId, body.reason) };
  }
}

@Controller('students')
export class StudentFeesController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id/fees')
  @RequirePermission('invoice.view')
  async statement(@Param('id', id) studentId: string) {
    return { data: await this.payments.statement(studentId) };
  }

  @Post(':id/credits/apply')
  @HttpCode(200)
  @RequirePermission('payment.collect')
  async applyCredit(@Param('id', id) studentId: string, @Body(new ZodPipe(applyCreditSchema)) body: Out<typeof applyCreditSchema>) {
    return { data: await this.payments.applyCredit(studentId, body.invoiceId) };
  }
}
