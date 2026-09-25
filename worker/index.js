import { fetchCsv, makeProof, isImmutableSource, validateDatasetUrl } from '../agent/audit.js';
import { publishProof } from '../agent/publish.js';
import { readSmallJson } from '../agent/http.js';

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/') && pathname !== '/api/audit') return Response.json({ error: 'Not found' }, { status: 404 });
    if (pathname !== '/api/audit') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    if (!(await env.AUDIT_GLOBAL_LIMIT.limit({ key: 'audit' })).success) {
      return Response.json({ error: 'Audit service is busy; try again shortly' }, { status: 429, headers: { 'retry-after': '60' } });
    }
    if (!(await env.AUDIT_CLIENT_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' })).success) {
      return Response.json({ error: 'Too many audits; try again shortly' }, { status: 429, headers: { 'retry-after': '60' } });
    }
    try {
      const { url } = await readSmallJson(request);
      validateDatasetUrl(url);
      if (env.PINATA_JWT || env.IPFS_API_URL) {
        const day = new Date().toISOString().slice(0, 10);
        const allowed = await env.AUDIT_QUOTA.getByName(`audit-${day}`).consume();
        if (!allowed) return Response.json({ error: 'Daily publishing quota reached; try again tomorrow' }, { status: 429, headers: { 'retry-after': '3600' } });
      }
      const raw = await fetchCsv(url);
      const { proof, body, proofSha256 } = makeProof(url, raw);
      const { cid, published } = await publishProof(body, { ipfsApi: env.IPFS_API_URL ?? null, pinataJwt: env.PINATA_JWT ?? null });
      return Response.json({ cid, published, registrable: isImmutableSource(url), proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url });
    } catch (error) {
      console.error(JSON.stringify({ event: 'audit_failed', error: error.message }));
      return Response.json({ error: error.message }, { status: error.status || 400 });
    }
  },
};
