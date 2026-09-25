import { fetchCsv, makeProof, isImmutableSource } from '../../agent/audit.js';
import { publishProof } from '../../agent/publish.js';
import { readSmallJson } from '../../agent/http.js';

export default async function handler(request) {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const { url } = await readSmallJson(request);
    const raw = await fetchCsv(url);
    const { proof, body, proofSha256 } = makeProof(url, raw);
    const { cid, published } = await publishProof(body);
    return Response.json({ cid, published, registrable: isImmutableSource(url), proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url, proof: published ? undefined : proof });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}
