import { existsSync } from 'node:fs';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Logger } from 'pino';
import type { Browser } from 'puppeteer-core';
import { ENV, type Env } from '../../config/env.js';
import { LOGGER } from '../logger/logger.js';

/** HTML → PDF. Business code never touches the browser directly. */
export abstract class PdfRenderer {
  abstract render(html: string): Promise<Buffer>;
}

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

/**
 * Headless Chromium (docs/01: PDFs are rendered in the worker). One browser is reused; each
 * document gets a fresh page with JavaScript off and no network — templates inline everything
 * (logo as a data: URI), so author text can never fetch or run anything.
 */
@Injectable()
export class ChromiumPdfRenderer extends PdfRenderer implements OnApplicationShutdown {
  private browser?: Promise<Browser>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super();
  }

  private launch(): Promise<Browser> {
    this.browser ??= (async () => {
      const executablePath = this.env.CHROMIUM_PATH || CHROME_PATHS.find((p) => existsSync(p));
      if (!executablePath) throw new Error('No Chrome/Chromium found. Set CHROMIUM_PATH, or PDF_RENDERER=basic.');
      const { launch } = await import('puppeteer-core');
      const browser = await launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
      browser.on('disconnected', () => (this.browser = undefined));
      this.logger.info({ executablePath }, 'pdf browser started');
      return browser;
    })().catch((err: unknown) => {
      this.browser = undefined;
      throw err;
    });
    return this.browser;
  }

  async render(html: string): Promise<Buffer> {
    const page = await (await this.launch()).newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => (req.url().startsWith('data:') || req.url() === 'about:blank' ? req.continue() : req.abort()));
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.browser) await (await this.browser.catch(() => undefined))?.close().catch(() => undefined);
  }
}

/** Plain-text PDF (no browser) for tests and machines without Chrome. Not for real documents. */
@Injectable()
export class BasicPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '  ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim().replace(/[^\x20-\x7e]/g, '?');
      if (!line) continue;
      if (y < 40) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line.slice(0, 110), { x: 40, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    }
    return Buffer.from(await pdf.save());
  }
}

/** Merge PDFs (e.g. a whole section's report cards) into one file. */
export async function mergePdfs(files: Buffer[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const doc = await PDFDocument.load(f);
    for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
  }
  return Buffer.from(await out.save());
}
