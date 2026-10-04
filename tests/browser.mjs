import { chromium } from 'playwright';

const url = process.env.DATATRUTH_SITE_URL || 'https://datatruth.alemzdelight.workers.dev/';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.walletMethods = [];
  window.ethereum = {
    request: async ({ method }) => {
      window.walletMethods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
      if (method === 'eth_chainId') return '0xf22d';
      throw new Error(`Unsupported wallet method: ${method}`);
    },
    on() {}, removeListener() {},
  };
});
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('heading', { name: /Know your data/ }).waitFor();
  await page.setViewportSize({ width: 375, height: 800 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Landing page mobile horizontal overflow');
  await page.getByRole('button', { name: 'Open menu' }).click();
  if (await page.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded') !== 'true') throw new Error('Mobile menu did not open');
  await page.getByRole('link', { name: 'How it works' }).first().click();
  await page.getByRole('heading', { name: 'How it works.' }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('How it works mobile horizontal overflow');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Verdicts' }).first().click();
  await page.getByRole('heading', { name: 'Real verdicts.' }).waitFor();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'FAQ' }).first().click();
  await page.getByRole('heading', { name: 'Frequently asked.' }).waitFor();
  await page.locator('summary').first().click();
  if (!(await page.getByText('The frontend and auditor run on Cloudflare').isVisible())) throw new Error('FAQ did not expand');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'About' }).first().click();
  await page.getByRole('heading', { name: 'Evidence, made useful.' }).waitFor();
  await page.getByRole('link', { name: 'DataTruth home' }).click();
  await page.getByRole('link', { name: 'Explore the docs' }).click();
  await page.getByRole('heading', { name: 'Documentation.' }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Docs page mobile horizontal overflow');
  await page.getByRole('link', { name: 'Launch workspace' }).click();
  await page.getByRole('heading', { name: 'Audit workspace.' }).waitFor();
  await page.getByRole('combobox', { name: 'Choose wallet' }).selectOption('injected');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByText('0x1111…1111').waitFor();
  if (await page.evaluate(() => window.walletMethods.some(method => method.toLowerCase().includes('snap')))) throw new Error('Wallet connection called a Snap method');
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
