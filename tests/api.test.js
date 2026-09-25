import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import netlify from '../netlify/functions/audit.js';

const assets = { fetch: async () => new Response('app') };
const limits = { AUDIT_GLOBAL_LIMIT: { limit: async () => ({ success: true }) }, AUDIT_CLIENT_LIMIT: { limit: async () => ({ success: true }) } };

test('unknown Worker API routes return JSON 404', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/unknown'), { ASSETS: assets, ...limits });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('Worker rejects invalid URL before calling the network', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/audit', {
    method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1/private' }),
  }), { ASSETS: assets, ...limits });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /HTTPS/);
});

test('Worker blocks audits when rate limit is exceeded', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/audit', { method: 'POST' }), {
    ASSETS: assets, ...limits, AUDIT_GLOBAL_LIMIT: { limit: async () => ({ success: false }) },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('Worker enforces daily publishing quota before fetching a valid source', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/audit', {
    method: 'POST', body: JSON.stringify({ url: 'https://raw.githubusercontent.com/org/repo/main/data.csv' }),
  }), { ASSETS: assets, ...limits, PINATA_JWT: 'test-only', AUDIT_QUOTA: { getByName: () => ({ consume: async () => false }) } });
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /quota/);
});

test('Netlify rejects oversized streaming input', async () => {
  const response = await netlify(new Request('https://example.com/api/audit', {
    method: 'POST', body: JSON.stringify({ url: 'x'.repeat(5000) }),
  }));
  assert.equal(response.status, 413);
});
