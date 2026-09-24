import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export const MAX_BYTES = 1_000_000;
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function inspectCsv(raw) {
  const records = parse(raw, { bom: true, skip_empty_lines: true, relax_quotes: false, skip_records_with_empty_values: false, ltrim: true });
  if (records.length < 2) throw new Error('CSV needs a header and at least one data row');
  const headers = records[0];
  if (headers.length === 0 || headers.some((h) => !h.trim())) throw new Error('CSV headers must be nonempty');
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique');
  const data = records.slice(1);
  if (data.some((row) => row.length !== headers.length)) throw new Error('CSV has rows with a different column count');
  const missing = headers.map((_, i) => data.filter((row) => row[i].trim() === '').length);
  const duplicates = data.length - new Set(data.map((row) => JSON.stringify(row))).size;
  return { rows: data.length, columns: headers.length, headers, missing, duplicates };
}

export function makeProof(url, raw) {
  const bytes = Buffer.byteLength(raw);
  if (bytes > MAX_BYTES) throw new Error('Dataset exceeds the 1 MB demo limit');
  const metrics = inspectCsv(raw);
  const proof = { schema: 'datatruth/v1', sourceUrl: url, rawSha256: sha256(Buffer.from(raw)), metrics, rawCsv: raw };
  const body = Buffer.from(JSON.stringify(proof));
  return { proof, body, proofSha256: sha256(body) };
}

export async function fetchCsv(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Use an HTTPS dataset URL');
  if (!['raw.githubusercontent.com', 'gist.githubusercontent.com', 'people.sc.fsu.edu', 'data.gov'].includes(parsed.hostname)) {
    throw new Error('Dataset host is not on the demo allowlist');
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) throw new Error('Dataset redirect not allowed');
  if (!response.ok) throw new Error(`Dataset returned HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new Error('Dataset exceeds the 1 MB demo limit');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { await response.body.cancel().catch(() => {}); throw new Error('Dataset exceeds the 1 MB demo limit'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
