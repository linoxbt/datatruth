import { fetchCsv, makeProof } from '../../agent/audit.js';
import { publishProof } from '../../agent/publish.js';

export default async function handler(request) {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const input = await request.text();
    if (input.length > 4096) throw new Error('Request too large');
    const { url } = JSON.parse(input);
    const raw = await fetchCsv(url);
    const { proof, body, proofSha256 } = makeProof(url, raw);
    const { cid, published } = await publishProof(body);
    return Response.json({ cid, published, proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url, proof: published ? undefined : proof });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export const config = { path: '/api/audit' };
