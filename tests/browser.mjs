import { chromium } from 'playwright';

const url = process.env.DATATRUTH_SITE_URL || 'https://datatruth.alemzdelight.workers.dev/';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('button', { name: /Run audit/ }).click();
  await page.getByText('LOCAL PREVIEW').waitFor({ timeout: 60000 });
  if (!(await page.getByText('QmUdU5hXqsFQmVU6w79WvXcV6RCD5RRWJS6TF49HzHv3rf').isVisible())) throw new Error('Sample proof CID is missing');
  await page.getByRole('button', { name: 'View' }).click();
  await page.getByText('CURRENT RECORD · Verified').waitFor({ timeout: 30000 });
  await page.setViewportSize({ width: 375, height: 800 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile horizontal overflow');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log('Live audit, CID, on-chain record, and mobile layout passed');
} finally {
  await browser.close();
}
