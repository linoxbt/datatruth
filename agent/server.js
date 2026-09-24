import http from 'node:http';
import { makeProof, fetchCsv } from './audit.js';
import Hash from 'ipfs-only-hash';

const port = Number(process.env.PORT || 8787);
const ipfsApi = process.env.IPFS_API_URL;

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': 'http://127.0.0.1:5173' });
  res.end(JSON.stringify(value));
}

async function upload(body) {
  const expectedCid = await Hash.of(body, { cidVersion: 0 });
  if (!ipfsApi) return { cid: expectedCid, published: false };
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'application/json' }), 'audit.json');
  const endpoint = new URL('/api/v0/add?cid-version=0&pin=true', ipfsApi);
  const response = await fetch(endpoint, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`IPFS upload returned HTTP ${response.status}`);
  const result = JSON.parse((await response.text()).trim().split('\n').at(-1));
  if (result.Hash !== expectedCid) throw new Error('IPFS returned a CID for different content');
  return { cid: result.Hash, published: true };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': 'http://127.0.0.1:5173', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
    return res.end();
  }
  if (req.method !== 'POST' || req.url !== '/api/audit') return json(res, 404, { error: 'Not found' });
  try {
    let input = '';
    for await (const chunk of req) {
      input += chunk;
      if (input.length > 4096) throw new Error('Request too large');
    }
    const { url } = JSON.parse(input);
    const raw = await fetchCsv(url);
    const { proof, body, proofSha256 } = makeProof(url, raw);
    const { cid, published } = await upload(body);
    return json(res, 200, { cid, published, proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url, proof: published ? undefined : proof });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`DataTruth auditor: http://127.0.0.1:${port}`));
