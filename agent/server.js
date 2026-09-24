import http from 'node:http';
import { makeProof, fetchCsv } from './audit.js';
import { publishProof } from './publish.js';

const port = Number(process.env.PORT || 8787);

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': 'http://127.0.0.1:5173' });
  res.end(JSON.stringify(value));
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
    const { cid, published } = await publishProof(body);
    return json(res, 200, { cid, published, proofSha256, metrics: proof.metrics, rawSha256: proof.rawSha256, sourceUrl: url, proof: published ? undefined : proof });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`DataTruth auditor: http://127.0.0.1:${port}`));
