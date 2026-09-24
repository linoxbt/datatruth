import { fetchCsv, makeProof } from '../agent/audit.js';
import { publishProof } from '../agent/publish.js';

async function readSmallBody(request) {
  if (Number(request.headers.get('content-length')) > 4096) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/audit') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const { url } = await readSmallBody(request);
      const raw = await fetchCsv(url);
      const { proof, body, proofSha256 } = makeProof(url, raw);
      const { cid, published } = await publishProof(body, { ipfsApi: env.IPFS_API_URL ?? null, pinataJwt: env.PINATA_JWT ?? null });
      return Response.json({ cid, published, proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url });
    } catch (error) {
      console.error(JSON.stringify({ event: 'audit_failed', error: error.message }));
      return Response.json({ error: error.message }, { status: 400 });
    }
  },
};
