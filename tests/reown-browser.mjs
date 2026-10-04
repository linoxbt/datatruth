import { chromium } from 'playwright';

const site = process.env.DATATRUTH_REOWN_TEST_URL || 'http://127.0.0.1:5177';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${site}/app`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByText('POWERED BY REOWN APPKIT').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.locator('w3m-modal.open').waitFor({ timeout: 15000 });
  if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
  console.log('Reown AppKit wallet modal opened without page errors');
} finally {
  await browser.close();
}
