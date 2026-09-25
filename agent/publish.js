import { importer } from 'ipfs-unixfs-importer';
import { MemoryBlockstore } from 'blockstore-core/memory';
import { HttpError } from './http.js';

export async function proofCid(body) {
  const blocks = new MemoryBlockstore();
  for await (const entry of importer([{ content: body }], blocks, { cidVersion: 0, rawLeaves: false })) {
    return entry.cid.toString();
  }
  throw new Error('Could not calculate IPFS CID');
}

export async function publishProof(body, { ipfsApi = process.env.IPFS_API_URL, pinataJwt = process.env.PINATA_JWT } = {}) {
  const expectedCid = await proofCid(body);
  if (!ipfsApi && !pinataJwt) return { cid: expectedCid, published: false };

  const form = new FormData();
  form.append('file', new Blob([body], { type: 'application/json' }), 'audit.json');
  let endpoint;
  let headers = {};
  if (pinataJwt) {
    endpoint = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    headers = { Authorization: `Bearer ${pinataJwt}` };
    form.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));
  } else {
    endpoint = new URL('/api/v0/add?cid-version=0&pin=true', ipfsApi);
  }
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(30000) }); }
  catch { throw new HttpError(502, 'IPFS publishing service is unavailable'); }
  if (!response.ok) throw new HttpError(502, `IPFS upload returned HTTP ${response.status}`);
  let result;
  try { result = JSON.parse((await response.text()).trim().split('\n').at(-1)); }
  catch { throw new HttpError(502, 'IPFS publishing service returned invalid data'); }
  const cid = pinataJwt ? result.IpfsHash : result.Hash;
  if (cid !== expectedCid) throw new HttpError(502, 'IPFS returned a CID for different content');
  return { cid, published: true };
}
