import Hash from 'ipfs-only-hash';

export async function publishProof(body, { ipfsApi = process.env.IPFS_API_URL, pinataJwt = process.env.PINATA_JWT } = {}) {
  const expectedCid = await Hash.of(body, { cidVersion: 0 });
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
  const response = await fetch(endpoint, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`IPFS upload returned HTTP ${response.status}`);
  const result = JSON.parse((await response.text()).trim().split('\n').at(-1));
  const cid = pinataJwt ? result.IpfsHash : result.Hash;
  if (cid !== expectedCid) throw new Error('IPFS returned a CID for different content');
  return { cid, published: true };
}
